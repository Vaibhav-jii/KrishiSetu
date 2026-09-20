"""
KisanMind Price Predictor (XGBoost)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Trains and serves an XGBoost regression model for
7-day crop price prediction.

Features: crop_type (encoded), state (encoded), month, season, last_30d_avg_price
Target:   predicted price for next 7 days

The model is trained on the real agmarknet dataset when available,
falling back to synthetic data. Saved as price_model.pkl.
"""

import os
import warnings

import joblib
import numpy as np
import pandas as pd
from sklearn.preprocessing import LabelEncoder

warnings.filterwarnings("ignore")

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
MODEL_PATH = os.path.join(MODEL_DIR, "price_model.pkl")
ENCODERS_PATH = os.path.join(MODEL_DIR, "price_encoders.pkl")
DATASET_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "Dataset",
                            "agmarknet_india_historical_prices_2024_2025.csv")

# ── Canonical crop names (lowercase IDs used everywhere) ──
CROPS = [
    "wheat", "rice", "cotton", "sugarcane", "soyabean",
    "maize", "bajra", "jowar", "mustard", "groundnut",
    "onion", "potato", "tomato", "green chilli", "turmeric",
    "arhar", "green gram", "lentil", "garlic", "ginger",
    "cauliflower", "cabbage", "carrot", "bhindi", "brinjal",
    "banana", "mango", "apple", "gur",
]

# Only include states that exist in the agmarknet dataset
STATES = [
    "Andhra Pradesh", "Gujarat", "Kerala", "Madhya Pradesh",
    "Punjab", "Rajasthan", "Uttar Pradesh", "West Bengal",
]

# Dataset commodity name → our canonical crop id (lowercase)
DATASET_COMMODITY_MAP = {
    "Wheat": "wheat",
    "Maize": "maize",
    "Bajra(Pearl Millet/Cumbu)": "bajra",
    "Jowar(Sorghum)": "jowar",
    "Cotton": "cotton",
    "Soyabean": "soyabean",
    "Mustard": "mustard",
    "Groundnut": "groundnut",
    "Arhar (Tur/Red Gram)(Whole)": "arhar",
    "Green Gram (Moong)(Whole)": "green gram",
    "Lentil (Masur)(Whole)": "lentil",
    "Onion": "onion",
    "Potato": "potato",
    "Tomato": "tomato",
    "Green Chilli": "green chilli",
    "Garlic": "garlic",
    "Ginger(Green)": "ginger",
    "Cauliflower": "cauliflower",
    "Cabbage": "cabbage",
    "Carrot": "carrot",
    "Bhindi(Ladies Finger)": "bhindi",
    "Brinjal": "brinjal",
    "Banana": "banana",
    "Mango": "mango",
    "Apple": "apple",
    "Gur(Jaggery)": "gur",
    "Turmeric": "turmeric",
}

# Approximate real mandi price ranges (₹ per quintal)
PRICE_RANGES = {
    "wheat": (2000, 2800), "rice": (2500, 3500), "cotton": (6000, 8500),
    "sugarcane": (300, 400), "soyabean": (4000, 5500), "maize": (1800, 2600),
    "bajra": (2200, 3000), "jowar": (2600, 3400), "mustard": (4800, 6200),
    "groundnut": (5000, 7000), "onion": (800, 3500), "potato": (600, 2000),
    "tomato": (500, 4000), "green chilli": (3000, 8000), "turmeric": (7000, 12000),
    "arhar": (6000, 9000), "green gram": (6000, 8500), "lentil": (4000, 6500),
    "garlic": (3000, 8000), "ginger": (3000, 7000), "cauliflower": (800, 2500),
    "cabbage": (500, 1800), "carrot": (1000, 3000), "bhindi": (1500, 4000),
    "brinjal": (800, 2500), "banana": (1500, 4000), "mango": (2000, 8000),
    "apple": (5000, 12000), "gur": (3500, 6000),
}


def _get_season(month: int) -> int:
    """Map month to season: 0=winter, 1=spring, 2=summer, 3=monsoon, 4=autumn."""
    if month in (12, 1, 2):
        return 0
    elif month in (3, 4):
        return 1
    elif month in (5, 6):
        return 2
    elif month in (7, 8, 9):
        return 3
    else:
        return 4


def _normalize_crop_name(name: str) -> str:
    """
    Normalize any crop name to our canonical lowercase ID.
    Handles frontend IDs (green_gram), dataset names (Bajra(Pearl Millet/Cumbu)),
    and already-canonical names (bajra).
    """
    # Try direct match after basic cleanup
    cleaned = name.lower().strip().replace("_", " ")
    if cleaned in CROPS:
        return cleaned

    # Try matching from dataset commodity map (case-insensitive)
    for dataset_name, canonical in DATASET_COMMODITY_MAP.items():
        if dataset_name.lower() == cleaned:
            return canonical

    return cleaned


def _load_real_dataset() -> pd.DataFrame | None:
    """
    Load the agmarknet CSV and transform it into training-ready format.
    Returns None if the CSV doesn't exist or can't be parsed.
    """
    if not os.path.exists(DATASET_PATH):
        print(f"[Warning] Dataset not found at {DATASET_PATH}, falling back to synthetic data.")
        return None

    try:
        print(f"[Data] Loading real dataset from {DATASET_PATH}...")
        df = pd.read_csv(DATASET_PATH)

        # Map commodity names to our canonical crop IDs
        df["crop"] = df["Commodity"].map(DATASET_COMMODITY_MAP)
        df = df.dropna(subset=["crop"])

        # Parse dates
        df["date"] = pd.to_datetime(df["Price Date"], format="%d %b %Y", errors="coerce")
        df = df.dropna(subset=["date"])

        # Use modal price as the main price signal
        df["price"] = pd.to_numeric(df["Modal Price (Rs./Quintal)"], errors="coerce")
        df = df.dropna(subset=["price"])
        df = df[df["price"] > 0]

        # Extract features
        df["state"] = df["State"]

        # Build training records using vectorized pandas operations (avoiding iterrows)
        records_df_list = []
        for (crop, state), group in df.groupby(["crop", "state"]):
            group = group.sort_values("date")
            prices = group[["date", "price"]].drop_duplicates("date")
            prices = prices.set_index("date").resample("D").mean().interpolate()

            if len(prices) < 10:
                continue

            prices["crop"] = crop
            prices["state"] = state
            # Rolling 30-day average
            prices["avg_30d"] = prices["price"].rolling(window=30, min_periods=5).mean()
            # 7-day forward price
            prices["target_7d"] = prices["price"].shift(-7)

            valid = prices.dropna(subset=["avg_30d", "target_7d"])
            records_df_list.append(valid)

        if not records_df_list:
            print("[Warning] No valid records could be constructed, falling back to synthetic data.")
            return None

        combined = pd.concat(records_df_list).reset_index()
        combined["month"] = combined["date"].dt.month
        combined["season"] = combined["month"].apply(_get_season)
        
        result_df = combined.rename(columns={
            "avg_30d": "last_30d_avg_price",
            "target_7d": "target_price_7d"
        })[["crop", "state", "month", "season", "last_30d_avg_price", "target_price_7d"]]
        
        result_df["last_30d_avg_price"] = result_df["last_30d_avg_price"].round(2)
        result_df["target_price_7d"] = result_df["target_price_7d"].round(2)

        if len(result_df) < 100:
            print(f"[Warning] Only {len(result_df)} records from real data, falling back to synthetic.")
            return None

        print(f"[Success] Loaded {len(result_df)} training records from real dataset.")
        print(f"   Crops: {sorted(result_df['crop'].unique())}")
        print(f"   States: {sorted(result_df['state'].unique())}")
        return result_df

    except Exception as e:
        print(f"[Warning] Error loading dataset: {e}. Falling back to synthetic data.")
        return None


def _generate_synthetic_data(n_samples: int = 5000) -> pd.DataFrame:
    """
    Generate realistic synthetic mandi price data.
    Prices vary by crop, state, season, and include noise.
    """
    np.random.seed(42)

    records = []
    for _ in range(n_samples):
        crop = np.random.choice(CROPS)
        state = np.random.choice(STATES)
        month = np.random.randint(1, 13)
        season = _get_season(month)

        low, high = PRICE_RANGES.get(crop, (1500, 3000))
        base_price = np.random.uniform(low, high)

        # Seasonal variation
        seasonal_factor = 1.0 + 0.1 * np.sin(2 * np.pi * month / 12)

        # State variation (some states get premium prices)
        state_factor = 1.0 + np.random.uniform(-0.05, 0.05)

        last_30d_avg = base_price * seasonal_factor * state_factor
        last_30d_avg += np.random.normal(0, base_price * 0.03)  # noise

        # Target: 7-day future price (slight trend + noise)
        trend = np.random.uniform(-0.05, 0.08)  # slight upward bias
        target_price = last_30d_avg * (1 + trend)
        target_price += np.random.normal(0, base_price * 0.02)

        records.append({
            "crop": crop,
            "state": state,
            "month": month,
            "season": season,
            "last_30d_avg_price": round(last_30d_avg, 2),
            "target_price_7d": round(target_price, 2),
        })

    return pd.DataFrame(records)


def train_model(data: pd.DataFrame = None) -> dict:
    """
    Train XGBoost regression model and save to disk.
    Tries real dataset first, falls back to synthetic.
    Returns training metrics.
    """
    import xgboost as xgb
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import mean_absolute_error, r2_score

    if data is None:
        # Try real dataset first
        data = _load_real_dataset()
        if data is None:
            data = _generate_synthetic_data()

    # Encode categoricals
    crop_enc = LabelEncoder()
    state_enc = LabelEncoder()

    data["crop_encoded"] = crop_enc.fit_transform(data["crop"])
    data["state_encoded"] = state_enc.fit_transform(data["state"])

    features = ["crop_encoded", "state_encoded", "month", "season", "last_30d_avg_price"]
    X = data[features]
    y = data["target_price_7d"]

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = xgb.XGBRegressor(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
    )

    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

    y_pred = model.predict(X_test)
    mae = mean_absolute_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)

    # Save model + encoders
    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    joblib.dump({"crop": crop_enc, "state": state_enc}, ENCODERS_PATH)

    print(f"   Encoder crops: {list(crop_enc.classes_)}")
    print(f"   Encoder states: {list(state_enc.classes_)}")

    return {
        "mae": round(mae, 2),
        "r2_score": round(r2, 4),
        "samples_trained": len(X_train),
        "samples_tested": len(X_test),
        "model_path": MODEL_PATH,
    }


def predict(crop: str, state: str, month: int, last_price: float) -> dict:
    """
    Predict 7-day crop price.

    Args:
        crop: crop name (e.g. "wheat", "green_gram")
        state: Indian state name (e.g. "Punjab")
        month: current month (1-12)
        last_price: last known price per quintal

    Returns:
        dict with predicted_price, confidence, etc.
    """
    # Auto-train if model doesn't exist
    if not os.path.exists(MODEL_PATH):
        print("[Predictor] Training price prediction model for the first time...")
        metrics = train_model()
        print(f"[Success] Model trained: MAE=Rs.{metrics['mae']}, R2={metrics['r2_score']}")

    model = joblib.load(MODEL_PATH)
    encoders = joblib.load(ENCODERS_PATH)

    crop_enc = encoders["crop"]
    state_enc = encoders["state"]

    # Normalize crop name using the shared normalizer
    crop_normalized = _normalize_crop_name(crop)

    # Handle unseen crops gracefully
    known_crops = list(crop_enc.classes_)
    if crop_normalized in known_crops:
        crop_code = crop_enc.transform([crop_normalized])[0]
    else:
        # Find closest match or use fallback
        print(f"[Warning] Unknown crop '{crop_normalized}', known: {known_crops}")
        crop_code = 0

    # Handle unseen states — return error for states not in dataset
    known_states = list(state_enc.classes_)
    if state in known_states:
        state_code = state_enc.transform([state])[0]
    else:
        return {
            "predicted_price": None,
            "confidence": 0,
            "prediction_horizon_days": 7,
            "model_type": "XGBoost Regressor",
            "error": f"No training data for state '{state}'. Available: {', '.join(known_states)}",
        }

    season = _get_season(month)

    X = np.array([[crop_code, state_code, month, season, last_price]])
    predicted = model.predict(X)[0]

    # Confidence based on how close last_price is to training range
    low, high = PRICE_RANGES.get(crop_normalized, (1500, 3000))
    in_range = low <= last_price <= high
    confidence = 83.2 if in_range else 55.0  # heuristic confidence

    return {
        "predicted_price": round(float(predicted), 2),
        "confidence": confidence,
        "prediction_horizon_days": 7,
        "model_type": "XGBoost Regressor",
    }


# ── CLI: Train the model independently ──
if __name__ == "__main__":
    print("[Predictor] Training KisanMind Price Prediction Model...")
    metrics = train_model()
    print(f"[Success] Done!")
    print(f"   MAE: Rs.{metrics['mae']} per quintal")
    print(f"   R2 Score: {metrics['r2_score']}")
    print(f"   Train samples: {metrics['samples_trained']}")
    print(f"   Test samples: {metrics['samples_tested']}")
    print(f"   Saved to: {metrics['model_path']}")
