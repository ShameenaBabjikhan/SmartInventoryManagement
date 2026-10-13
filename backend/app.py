
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from pathlib import Path
from database import get_connection, init_db

app = Flask(__name__)
CORS(app)

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

@app.route("/")
def home():
    return send_from_directory(FRONTEND_DIR, "index.html")

@app.route("/style.css")
def serve_styles():
    return send_from_directory(FRONTEND_DIR, "style.css")

@app.route("/script.js")
def serve_script():
    return send_from_directory(FRONTEND_DIR, "script.js")

@app.get("/health")
def health():
    return jsonify({
        "status": "healthy",
        "service": "Smart Inventory API"
    })


@app.get("/api/products")
def get_products():
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM products ORDER BY id DESC"
        ).fetchall()

    return jsonify([dict(row) for row in rows])


@app.post("/api/products")
def create_product():
    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "")).strip()
    sku = str(data.get("sku", "")).strip()
    category = str(data.get("category", "")).strip()

    if not name or not sku or not category:
        return jsonify({
            "error": "Name, SKU and category are required."
        }), 400

    try:
        price = float(data.get("price", -1))
        quantity = int(data.get("qty", -1))
        reorder_level = int(data.get("reorder", 10))
        daily_demand = float(data.get("demand", 2))

        if price < 0 or quantity < 0 or reorder_level < 0:
            raise ValueError

        if daily_demand < 0:
            raise ValueError

        if not all(map(lambda x: x < float("inf"), [
            price, daily_demand
        ])):
            raise ValueError

        if not all(map(lambda x: x < 2**63, [
            quantity, reorder_level
        ])):
            raise ValueError

    except (TypeError, ValueError, OverflowError):
        return jsonify({
            "error": "Enter valid non-negative numeric values."
        }), 400

    if isinstance(data.get("qty", 0), bool):
        return jsonify({"error": "Quantity must be an integer."}), 400

    if isinstance(data.get("reorder", 10), bool):
        return jsonify({"error": "Reorder level must be an integer."}), 400

    if not isinstance(data.get("qty", 0), int):
        return jsonify({"error": "Quantity must be an integer."}), 400

    if not isinstance(data.get("reorder", 10), int):
        return jsonify({"error": "Reorder level must be an integer."}), 400

    try:
        with get_connection() as connection:
            cursor = connection.execute("""
                INSERT INTO products
                (name, sku, category, price, quantity,
                 reorder_level, daily_demand)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                name, sku, category, price, quantity,
                reorder_level, daily_demand
            ))

            product = connection.execute(
                "SELECT * FROM products WHERE id = ?",
                (cursor.lastrowid,)
            ).fetchone()

        return jsonify(dict(product)), 201

    except Exception as error:
        if "UNIQUE constraint failed" in str(error):
            return jsonify({"error": "SKU already exists."}), 409
        raise


@app.put("/api/products/<int:product_id>")
def update_product(product_id):
    data = request.get_json(silent=True) or {}

    allowed = {
        "name", "sku", "category", "price",
        "qty", "reorder", "demand"
    }

    if not data or not set(data).issubset(allowed):
        return jsonify({"error": "Invalid product fields."}), 400

    with get_connection() as connection:
        existing = connection.execute(
            "SELECT * FROM products WHERE id = ?",
            (product_id,)
        ).fetchone()

        if existing is None:
            return jsonify({"error": "Product not found."}), 404

        current = dict(existing)

        fields = {
            "name": "name",
            "sku": "sku",
            "category": "category",
            "price": "price",
            "qty": "quantity",
            "reorder": "reorder_level",
            "demand": "daily_demand"
        }

        for key, column in fields.items():
            if key in data:
                current[column] = data[key]

        try:
            current["price"] = float(current["price"])
            current["daily_demand"] = float(current["daily_demand"])

            for key in ("quantity", "reorder_level"):
                value = current[key]
                if isinstance(value, bool) or not isinstance(value, int):
                    raise ValueError

            if (current["price"] < 0 or
                current["daily_demand"] < 0 or
                current["quantity"] < 0 or
                current["reorder_level"] < 0):
                raise ValueError

            for key in ("name", "sku", "category"):
                if not isinstance(current[key], str) or not current[key].strip():
                    raise ValueError

        except (ValueError, TypeError, OverflowError):
            return jsonify({"error": "Invalid product values."}), 400

        try:
            connection.execute("""
                UPDATE products
                SET name=?, sku=?, category=?, price=?, quantity=?,
                    reorder_level=?, daily_demand=?
                WHERE id=?
            """, (
                current["name"].strip(),
                current["sku"].strip(),
                current["category"].strip(),
                current["price"],
                current["quantity"],
                current["reorder_level"],
                current["daily_demand"],
                product_id
            ))

            product = connection.execute(
                "SELECT * FROM products WHERE id = ?",
                (product_id,)
            ).fetchone()

        except Exception as error:
            if "UNIQUE constraint failed" in str(error):
                return jsonify({"error": "SKU already exists."}), 409
            raise

    return jsonify(dict(product))


@app.delete("/api/products/<int:product_id>")
def delete_product(product_id):
    with get_connection() as connection:
        cursor = connection.execute(
            "DELETE FROM products WHERE id = ?",
            (product_id,)
        )

    if cursor.rowcount == 0:
        return jsonify({"error": "Product not found."}), 404

    return jsonify({"message": "Product deleted successfully."})


@app.get("/api/dashboard")
def dashboard():
    with get_connection() as connection:
        summary = connection.execute("""
            SELECT COUNT(*) AS total_products,
                   COALESCE(SUM(quantity), 0) AS total_units,
                   COALESCE(SUM(price * quantity), 0) AS inventory_value,
                   COALESCE(SUM(
                       CASE WHEN quantity <= reorder_level
                       THEN 1 ELSE 0 END
                   ), 0) AS low_stock_count
            FROM products
        """).fetchone()

    return jsonify(dict(summary))


@app.get("/api/alerts")
def alerts():
    with get_connection() as connection:
        rows = connection.execute("""
            SELECT * FROM products
            WHERE quantity <= reorder_level
            ORDER BY quantity ASC
        """).fetchall()

    return jsonify([dict(row) for row in rows])


@app.get("/api/forecasts")
def forecasts():
    with get_connection() as connection:
        rows = connection.execute("""
            SELECT id, name, sku, quantity, daily_demand,
                   CASE
                     WHEN daily_demand > 0
                     THEN CAST(quantity / daily_demand AS INTEGER)
                     ELSE NULL
                   END AS estimated_days_left
            FROM products
            ORDER BY quantity ASC
        """).fetchall()

    return jsonify([dict(row) for row in rows])


@app.get("/api/suppliers")
def get_suppliers():
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM suppliers ORDER BY id DESC"
        ).fetchall()

    return jsonify([dict(row) for row in rows])


@app.post("/api/suppliers")
def create_supplier():
    data = request.get_json(silent=True) or {}
    fields = [
        str(data.get(key, "")).strip()
        for key in ("name", "company", "email", "phone")
    ]

    if not all(fields):
        return jsonify({"error": "All supplier fields are required."}), 400

    with get_connection() as connection:
        cursor = connection.execute("""
            INSERT INTO suppliers (name, company, email, phone)
            VALUES (?, ?, ?, ?)
        """, fields)

        row = connection.execute(
            "SELECT * FROM suppliers WHERE id = ?",
            (cursor.lastrowid,)
        ).fetchone()

    return jsonify(dict(row)), 201


@app.post("/api/stock-movements")
def create_movement():
    data = request.get_json(silent=True) or {}
    product_id = data.get("product_id")
    movement_type = data.get("type")
    quantity = data.get("qty")
    note = str(data.get("note", "")).strip()

    if (isinstance(product_id, bool) or not isinstance(product_id, int) or
        isinstance(quantity, bool) or not isinstance(quantity, int) or
        quantity <= 0 or movement_type not in ("IN", "OUT")):
        return jsonify({"error": "Invalid movement details."}), 400

    with get_connection() as connection:
        product = connection.execute(
            "SELECT * FROM products WHERE id = ?",
            (product_id,)
        ).fetchone()

        if product is None:
            return jsonify({"error": "Product not found."}), 404

        new_quantity = product["quantity"] + (
            quantity if movement_type == "IN" else -quantity
        )

        if new_quantity < 0:
            return jsonify({"error": "Insufficient stock."}), 400

        connection.execute(
            "UPDATE products SET quantity = ? WHERE id = ?",
            (new_quantity, product_id)
        )

        cursor = connection.execute("""
            INSERT INTO stock_movements
            (product_id, movement_type, quantity, note)
            VALUES (?, ?, ?, ?)
        """, (product_id, movement_type, quantity, note))

        movement = connection.execute(
            "SELECT * FROM stock_movements WHERE id = ?",
            (cursor.lastrowid,)
        ).fetchone()

    return jsonify(dict(movement)), 201


@app.get("/api/stock-movements")
def get_movements():
    with get_connection() as connection:
        rows = connection.execute("""
            SELECT m.*, p.name AS product_name, p.sku
            FROM stock_movements m
            LEFT JOIN products p ON p.id = m.product_id
            ORDER BY m.id DESC
        """).fetchall()

    return jsonify([dict(row) for row in rows])


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=False)
