"""
Face Recognition Microservice
Handles face registration and recognition using face_recognition + OpenCV
"""
import os
import io
import json
import logging
import numpy as np
from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.responses import JSONResponse
import face_recognition
from PIL import Image
import psycopg2
from psycopg2.pool import ThreadedConnectionPool
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Face Recognition Service", version="1.0.0")

TOLERANCE = float(os.getenv("TOLERANCE", "0.5"))

# ── Connection pool ──────────────────────────────────────────
# Reuses connections instead of opening a new one per request.

_pool: Optional[ThreadedConnectionPool] = None

def get_pool() -> ThreadedConnectionPool:
    global _pool
    if _pool is None:
        _pool = ThreadedConnectionPool(
            minconn=2,
            maxconn=10,
            host=os.getenv("DB_HOST", "localhost"),
            port=int(os.getenv("DB_PORT", "5432")),
            dbname=os.getenv("DB_NAME", "attendance_db"),
            user=os.getenv("DB_USER", "postgres"),
            password=os.getenv("DB_PASSWORD", "postgres123"),
            cursor_factory=RealDictCursor,
        )
    return _pool


# ── In-memory encoding cache ─────────────────────────────────
# Loaded once at startup, refreshed on register/delete.
# Eliminates a full DB scan on every attendance mark.

_encoding_cache: list[dict] = []   # [{employee_id, encoding}, ...]

def _load_encodings_from_db() -> list[dict]:
    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT employee_id, encoding FROM face_encodings")
            rows = cur.fetchall()
        result = []
        for row in rows:
            enc_data = row["encoding"]
            if isinstance(enc_data, str):
                enc_data = json.loads(enc_data)
            result.append({
                "employee_id": str(row["employee_id"]),
                "encoding": np.array(enc_data, dtype=np.float64),
            })
        logger.info("Loaded %d face encoding(s) from DB.", len(result))
        return result
    finally:
        pool.putconn(conn)

def refresh_cache():
    global _encoding_cache
    _encoding_cache = _load_encodings_from_db()


# ── Startup ──────────────────────────────────────────────────

@app.on_event("startup")
def on_startup():
    """Verify DB connection and warm up the encoding cache."""
    try:
        pool = get_pool()
        conn = pool.getconn()
        conn.cursor().execute("SELECT 1")
        pool.putconn(conn)
        logger.info("Database connection OK.")
    except Exception as exc:
        logger.error("Cannot connect to database: %s", exc)
        raise RuntimeError("Database unavailable at startup") from exc

    refresh_cache()
    logger.info("Face service ready.")


# ── Image helpers ────────────────────────────────────────────

def read_image_bytes(image_bytes: bytes) -> np.ndarray:
    """Convert image bytes → RGB numpy array for face_recognition."""
    pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    return np.array(pil_img)


# ── Endpoints ────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "registered_faces": len(_encoding_cache)}


@app.post("/reload")
def reload_cache():
    """Force reload face encodings from DB into memory cache."""
    refresh_cache()
    return {"success": True, "registered_faces": len(_encoding_cache)}


@app.post("/register")
async def register_face(
    employee_id: str = Form(...),
    image: UploadFile = File(...),
):
    """
    Detect and encode a face from the uploaded image.

    IMPORTANT: This endpoint only computes and returns the encoding.
    Persisting it to the database is the responsibility of the Node backend
    (faceController.js) — doing it here as well would create duplicate rows.

    NOTE: For production, add a liveness / anti-spoofing check here
    (e.g. Silent-Face-Anti-Spoofing) before accepting the encoding.
    """
    image_bytes = await image.read()
    img_array = read_image_bytes(image_bytes)

    face_locations = face_recognition.face_locations(img_array, model="hog")
    if not face_locations:
        raise HTTPException(status_code=400, detail="No face detected in the image")
    if len(face_locations) > 1:
        raise HTTPException(
            status_code=400,
            detail="Multiple faces detected — please use a single-face image",
        )

    encodings = face_recognition.face_encodings(img_array, face_locations)
    encoding = encodings[0].tolist()

    # Refresh cache so this employee is immediately recognisable
    # (Node will have written the row to DB before the next /recognize call,
    # but refreshing here keeps things consistent if the cache is long-lived)
    refresh_cache()

    return {"success": True, "employee_id": employee_id, "encoding": encoding}


@app.post("/recognize")
async def recognize_face(image: UploadFile = File(...)):
    """
    Identify an employee from a captured image using the in-memory cache.

    NOTE: Add liveness detection here to prevent spoofing via printed photos.
    """
    image_bytes = await image.read()
    img_array = read_image_bytes(image_bytes)

    face_locations = face_recognition.face_locations(img_array, model="hog")
    if not face_locations:
        return JSONResponse(
            {"success": False, "employee_id": None, "message": "No face detected"}
        )

    face_encodings_list = face_recognition.face_encodings(img_array, face_locations)
    if not face_encodings_list:
        return JSONResponse(
            {"success": False, "employee_id": None, "message": "Could not encode face"}
        )

    unknown_encoding = face_encodings_list[0]

    known = _encoding_cache
    if not known:
        return JSONResponse(
            {"success": False, "employee_id": None, "message": "No registered faces in system"}
        )

    known_encodings = [k["encoding"] for k in known]
    known_ids = [k["employee_id"] for k in known]

    distances = face_recognition.face_distance(known_encodings, unknown_encoding)
    best_idx = int(np.argmin(distances))
    best_dist = float(distances[best_idx])

    if best_dist <= TOLERANCE:
        return {
            "success": True,
            "employee_id": known_ids[best_idx],
            "confidence": round(1 - best_dist, 4),
        }

    return JSONResponse(
        {
            "success": False,
            "employee_id": None,
            "message": "Face not recognized",
            "distance": round(best_dist, 4),
        }
    )


@app.delete("/delete/{employee_id}")
async def delete_face(employee_id: str):
    """
    Remove face encoding(s) for an employee and refresh the cache.

    Note: The Node backend deletes from the DB before calling this endpoint,
    so the DB delete here is a safety net for standalone deployments.
    """
    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM face_encodings WHERE employee_id = %s", (employee_id,)
            )
        conn.commit()
    finally:
        pool.putconn(conn)

    refresh_cache()
    return {"success": True, "message": "Face encoding deleted"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
    )
