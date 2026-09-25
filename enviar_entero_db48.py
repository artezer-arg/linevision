import sys
import os

# Redirecciona a enviar_receta_db48.py manteniendo compatibilidad
script_path = os.path.join(os.path.dirname(__file__), "enviar_receta_db48.py")
with open(script_path, "r", encoding="utf-8") as f:
    code = f.read()

exec(compile(code, script_path, 'exec'))
