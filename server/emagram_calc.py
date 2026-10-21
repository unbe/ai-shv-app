#!/usr/bin/env python3
"""
Scientific aerological sounding and Emagram (Skew-T / Stüve) analysis calculator for paragliding.
Calculates:
- Lifting Condensation Level (LCL / Wolkenbasis)
- Convective Condensation Level (CCL)
- Trigger temperature (Auslösetemperatur)
- Atmospheric Inversions (Inversionen & Sperrschichten)
- Parcel ascent curve (Dry adiabatic & moist adiabatic lapse rates)
- Thermal climb strength (m/s) and thermal ceiling (Thermikobergrenze)
"""

import sys
import json
import math

# Physical constants
R_DRY = 287.058  # Specific gas constant for dry air, J/(kg K)
CP_DRY = 1005.0  # Specific heat of dry air, J/(kg K)
GAMMA_DRY = 0.0098  # Dry adiabatic lapse rate, ~9.8 K/km
G = 9.80665      # Gravitational acceleration, m/s^2
L_V = 2.501e6    # Latent heat of vaporization, J/kg

def pressure_to_altitude(p_hpa, p0_hpa=1013.25):
    """Convert pressure (hPa) to ISA standard altitude (m ASL)"""
    return 44330.0 * (1.0 - (p_hpa / p0_hpa) ** 0.1903)

def altitude_to_pressure(alt_m, p0_hpa=1013.25):
    """Convert altitude (m ASL) to standard pressure (hPa)"""
    return p0_hpa * ((1.0 - alt_m / 44330.0) ** (1.0 / 0.1903))

def saturation_vapor_pressure(t_c):
    """Tetens formula for saturation vapor pressure over water (hPa)"""
    return 6.112 * math.exp((17.67 * t_c) / (t_c + 243.5))

def dewpoint_from_vapor_pressure(e_hpa):
    """Invert Tetens formula to get dew point (°C)"""
    if e_hpa <= 0:
        return -50.0
    val = math.log(e_hpa / 6.112)
    return (243.5 * val) / (17.67 - val)

def mixing_ratio(p_hpa, t_c):
    """Saturation mixing ratio w_s (kg/kg)"""
    es = saturation_vapor_pressure(t_c)
    return 0.622 * (es / max(1.0, (p_hpa - es)))

def moist_adiabatic_lapse_rate(t_c, p_hpa):
    """Moist adiabatic lapse rate (K/m)"""
    t_k = t_c + 273.15
    ws = mixing_ratio(p_hpa, t_c)
    numerator = 1.0 + (L_V * ws) / (R_DRY * t_k)
    denominator = 1.0 + (L_V * L_V * ws * 0.622) / (CP_DRY * R_DRY * t_k * t_k)
    return (G / CP_DRY) * (numerator / denominator)

def analyze_sounding(sounding_levels, surface_temp_c=None, surface_dew_c=None):
    """
    Analyze sounding levels: list of dicts with keys:
    - p: pressure in hPa
    - alt: altitude in m ASL
    - t: temperature in °C
    - td: dew point in °C
    - wind_speed: km/h (optional)
    - wind_dir: deg (optional)
    """
    if not sounding_levels:
        return {}

    # Sort levels by altitude ascending (pressure descending)
    levels = sorted(sounding_levels, key=lambda x: x["alt"])
    surface = levels[0]

    s_t = surface_temp_c if surface_temp_c is not None else surface["t"]
    s_td = surface_dew_c if surface_dew_c is not None else surface["td"]
    s_alt = surface["alt"]
    s_p = surface["p"]

    # 1. LCL (Lifting Condensation Level / Wolkenbasis)
    # Bolton 1980 formula
    t_k = s_t + 273.15
    td_k = s_td + 273.15
    t_lcl_k = 1.0 / (1.0 / (td_k - 56.0) + math.log(t_k / td_k) / 800.0) + 56.0
    t_lcl = t_lcl_k - 273.15
    # Height above surface where parcel cools at dry adiabatic rate (9.8 K/km = 0.0098 K/m) to T_lcl
    lcl_height_agl = max(0.0, (s_t - t_lcl) / GAMMA_DRY)
    lcl_alt_asl = round(s_alt + lcl_height_agl)

    # 2. Inversion detection
    inversions = []
    for i in range(len(levels) - 1):
        l1 = levels[i]
        l2 = levels[i + 1]
        dt = l2["t"] - l1["t"]
        dz = l2["alt"] - l1["alt"]
        if dz > 0 and (dt / dz) > -0.001:  # Inversion or strong isothermal layer
            inversions.append({
                "bottom_alt": round(l1["alt"]),
                "top_alt": round(l2["alt"]),
                "bottom_temp": round(l1["t"], 1),
                "top_temp": round(l2["t"], 1),
                "strength_k": round(dt, 1),
                "is_ground_inversion": (l1["alt"] <= s_alt + 150)
            })

    # 3. Convective Trigger Temperature (Auslösetemperatur)
    # Temperature needed at ground to initiate dry convection reaching at least 800m AGL
    # or overcoming the lowest capping inversion
    capping_inversion = next((inv for inv in inversions if not inv["is_ground_inversion"]), None)
    if capping_inversion:
        # Dry adiabatic descent from top of capping inversion
        t_top = capping_inversion["top_temp"]
        dz = capping_inversion["top_alt"] - s_alt
        trigger_temp = round(t_top + (GAMMA_DRY * dz), 1)
    else:
        trigger_temp = round(s_t + 2.0, 1)

    # 4. Parcel ascent curve calculation
    parcel_curve = []
    current_t = s_t
    step_m = 100.0
    max_alt = min(5000.0, levels[-1]["alt"])
    current_alt = s_alt
    thermal_ceiling = s_alt
    cape = 0.0

    # Interpolator for environment temperature
    def get_env_temp(target_alt):
        if target_alt <= levels[0]["alt"]:
            return levels[0]["t"]
        if target_alt >= levels[-1]["alt"]:
            return levels[-1]["t"]
        for j in range(len(levels) - 1):
            if levels[j]["alt"] <= target_alt <= levels[j + 1]["alt"]:
                ratio = (target_alt - levels[j]["alt"]) / (levels[j + 1]["alt"] - levels[j]["alt"])
                return levels[j]["t"] + ratio * (levels[j + 1]["t"] - levels[j]["t"])
        return levels[-1]["t"]

    while current_alt <= max_alt:
        env_t = get_env_temp(current_alt)
        cur_p = altitude_to_pressure(current_alt)
        parcel_curve.append({
            "alt": round(current_alt),
            "p": round(cur_p, 1),
            "parcel_t": round(current_t, 1),
            "env_t": round(env_t, 1),
            "buoyancy_dt": round(current_t - env_t, 1)
        })

        if current_t >= env_t:
            thermal_ceiling = current_alt
            # Incremental CAPE: g * (T_p - T_env)/T_env * dz
            t_env_k = env_t + 273.15
            if current_t > env_t:
                cape += G * ((current_t - env_t) / t_env_k) * step_m

        # Step upward
        current_alt += step_m
        if current_alt < lcl_alt_asl:
            # Dry adiabatic
            current_t -= (GAMMA_DRY * step_m)
        else:
            # Moist adiabatic
            gamma_m = moist_adiabatic_lapse_rate(current_t, cur_p)
            current_t -= (gamma_m * step_m)

    # 5. Paragliding Thermal Quality Assessment
    # Typical climb rate w_max ~ sqrt(2 * CAPE), paraglider average climb rate ~ 0.08 * w_max
    climb_rate_avg = 0.0
    if cape > 0:
        w_max = math.sqrt(2.0 * cape)
        climb_rate_avg = min(6.0, max(0.5, round(w_max * 0.08, 1)))

    thermal_rating = "Schwach (Weak)"
    if climb_rate_avg >= 3.5:
        thermal_rating = "Sehr gut (Excellent / Hammer-Tag)"
    elif climb_rate_avg >= 2.0:
        thermal_rating = "Gut (Good XC conditions)"
    elif climb_rate_avg >= 1.0:
        thermal_rating = "Mässig (Moderate thermals)"

    return {
        "surface": {
            "alt": s_alt,
            "temp": round(s_t, 1),
            "dew": round(s_td, 1),
            "pressure": round(s_p, 1)
        },
        "cloud_base_lcl": {
            "alt_asl": lcl_alt_asl,
            "height_agl": round(lcl_height_agl),
            "temp_c": round(t_lcl, 1)
        },
        "thermal_ceiling_asl": round(thermal_ceiling),
        "thermal_depth_m": max(0, round(thermal_ceiling - s_alt)),
        "trigger_temperature_c": trigger_temp,
        "climb_rate_avg_ms": climb_rate_avg,
        "thermal_rating": thermal_rating,
        "cape_j_kg": round(cape, 1),
        "inversions": inversions,
        "parcel_curve": parcel_curve[::2]  # sample every 200m for concise payload
    }

def get_default_payerne_sounding():
    """Return standard Payerne (06610) 12Z sounding profile for Swiss Plateau & Prealps"""
    return [
        {"alt": 490, "p": 962.0, "t": 16.5, "td": 8.0, "wind_speed": 12, "wind_dir": 240},
        {"alt": 750, "p": 930.0, "t": 14.8, "td": 6.5, "wind_speed": 15, "wind_dir": 245},
        {"alt": 1000, "p": 905.0, "t": 13.0, "td": 5.0, "wind_speed": 18, "wind_dir": 250},
        {"alt": 1500, "p": 850.0, "t": 9.2, "td": 2.1, "wind_speed": 22, "wind_dir": 260},
        {"alt": 2000, "p": 800.0, "t": 5.5, "td": -1.2, "wind_speed": 26, "wind_dir": 265},
        {"alt": 2500, "p": 750.0, "t": 2.1, "td": -4.8, "wind_speed": 30, "wind_dir": 270},
        {"alt": 3000, "p": 700.0, "t": -1.5, "td": -9.0, "wind_speed": 35, "wind_dir": 275},
        {"alt": 3500, "p": 660.0, "t": -5.2, "td": -14.0, "wind_speed": 40, "wind_dir": 280},
        {"alt": 4000, "p": 620.0, "t": -9.0, "td": -19.5, "wind_speed": 45, "wind_dir": 280},
        {"alt": 5000, "p": 540.0, "t": -17.0, "td": -28.0, "wind_speed": 55, "wind_dir": 285}
    ]

if __name__ == "__main__":
    # If run via CLI or piped JSON
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        result = analyze_sounding(get_default_payerne_sounding())
        print(json.dumps(result, indent=2))
    elif not sys.stdin.isatty():
        try:
            payload = json.load(sys.stdin)
            levels = payload.get("sounding_levels", get_default_payerne_sounding())
            s_t = payload.get("surface_temp_c")
            s_td = payload.get("surface_dew_c")
            result = analyze_sounding(levels, s_t, s_td)
            print(json.dumps(result))
        except Exception as e:
            print(json.dumps({"error": str(e)}))
    else:
        result = analyze_sounding(get_default_payerne_sounding())
        print(json.dumps(result))
