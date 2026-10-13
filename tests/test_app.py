import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = PROJECT_ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

import pytest
import database
import app as app_module


@pytest.fixture
def client(tmp_path, monkeypatch):
    test_db = tmp_path / "test_inventory.db"

    # Redirect every database connection to the temporary test database.
    original_get_connection = database.get_connection

    def test_get_connection():
        import sqlite3

        connection = sqlite3.connect(test_db)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    monkeypatch.setattr(database, "get_connection", test_get_connection)
    monkeypatch.setattr(
        app_module, "get_connection", test_get_connection
    )

    database.init_db()

    app_module.app.config["TESTING"] = True

    with app_module.app.test_client() as test_client:
        yield test_client


def test_homepage(client):
    response = client.get("/")
    assert response.status_code == 200


def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.get_json()["status"] == "healthy"


def test_get_products(client):
    response = client.get("/api/products")
    assert response.status_code == 200
    assert isinstance(response.get_json(), list)


def test_dashboard(client):
    response = client.get("/api/dashboard")
    assert response.status_code == 200


def test_create_product(client):
    product = {
        "name": "Test Keyboard",
        "sku": "TEST-1001",
        "category": "Electronics",
        "price": 999,
        "qty": 10,
        "reorder": 3,
        "demand": 2
    }

    response = client.post("/api/products", json=product)
    assert response.status_code in (200, 201)

    # Verify that the product was saved.
    products_response = client.get("/api/products")
    products = products_response.get_json()

    assert any(p["sku"] == "TEST-1001" for p in products)
