import sys
import snap7
from snap7.util import set_int, get_int, set_bool, get_bool

def main():
    print("=" * 75)
    print("   COMUNICACIÓN SIEMENS S7-1500 - DB48 (RECETA + CONFIRMACIÓN OPCIONAL)")
    print("=" * 75)
    
    # 1. Obtener IP
    if len(sys.argv) > 1:
        ip = sys.argv[1].strip()
    else:
        ip = input(">> Ingrese la IP del PLC Siemens (ejemplo 192.168.1.50): ").strip()
        if not ip:
            print("[ERROR] Debe ingresar una dirección IP.")
            return

    # 2. Obtener Entero de Receta (DB48.DBW2)
    if len(sys.argv) > 2:
        try:
            receta = int(sys.argv[2].strip())
        except ValueError:
            print(f"[ERROR] '{sys.argv[2]}' no es un número entero válido.")
            return
    else:
        val_str = input(">> Ingrese el número entero de receta (nModeloCamara -> DB48.DBW2): ").strip()
        try:
            receta = int(val_str)
        except ValueError:
            print(f"[ERROR] '{val_str}' no es un número entero válido.")
            return

    if receta < -32768 or receta > 32767:
        print(f"[ERROR] 'Int' en Siemens es de 16 bits (-32768 a 32767). {receta} está fuera de rango.")
        return

    # 3. Determinar si se envía confirmación booleana (DB48.DBX4.0)
    enviar_confirmacion = False
    valor_confirmacion = True

    # Chequeo por argumentos CLI: --confirm, -c, --no-confirm
    args = [a.lower() for a in sys.argv[3:]]
    if "--no-confirm" in args:
        enviar_confirmacion = False
    elif "--confirm" in args or "-c" in args:
        enviar_confirmacion = True
        idx = args.index("--confirm") if "--confirm" in args else args.index("-c")
        if idx + 1 < len(args):
            val_arg = args[idx + 1]
            valor_confirmacion = val_arg in ("1", "true", "ok", "yes", "s", "si")
    elif len(sys.argv) <= 2:
        # Modo interactivo por consola
        resp = input(">> ¿Desea enviar confirmación booleana (bResultadoOK -> DB48.DBX4.0)? [S/N] (def: N): ").strip().lower()
        if resp in ("s", "si", "y", "yes", "1", "true"):
            enviar_confirmacion = True
            val_conf_str = input("   >> Valor de confirmación [1 = TRUE (OK) / 0 = FALSE (NOK)] (def: 1): ").strip()
            if val_conf_str in ("0", "false", "f", "nok", "no"):
                valor_confirmacion = False
            else:
                valor_confirmacion = True
        else:
            enviar_confirmacion = False

    print("\n" + "-" * 75)
    print(f" RESUMEN DE TRANSMISIÓN:")
    print(f"   PLC Destino:      {ip}:102 (S7-1500 Rack 0, Slot 1)")
    print(f"   Receta (Int):     {receta}  -->  DB48.DBW2 (nModeloCamara)")
    if enviar_confirmacion:
        print(f"   Confirmación:     {valor_confirmacion} (Bool)  -->  DB48.DBX4.0 (bResultadoOK) [ACTIVADA]")
    else:
        print(f"   Confirmación:     [DESACTIVADA] (No se modificará DB48.DBX4.0)")
    print("-" * 75)

    # 4. Conexión al PLC Siemens S7-1500
    plc = snap7.client.Client()
    try:
        print(f"\n[1/3] Conectando con el PLC S7-1500 en {ip}:102...")
        plc.connect(ip, rack=0, slot=1, tcp_port=102)

        if not plc.get_connected():
            print(f"[ERROR] No se pudo conectar con el PLC en {ip}:102")
            print("  Verifique cable de red, IP y que PUT/GET esté activado en TIA Portal.")
            return

        print("[OK] Conexión S7 establecida correctamente.")

        # 5. Escribir Receta en DB48.DBW2
        print(f"\n[2/3] Escribiendo Receta={receta} en DB48.DBW2 (Offset 2.0)...")
        buf_receta = bytearray(2)
        set_int(buf_receta, 0, receta)
        plc.db_write(db_number=48, start=2, data=buf_receta)

        # Leer de vuelta para verificación
        buf_verif_receta = plc.db_read(db_number=48, start=2, size=2)
        receta_leida = get_int(buf_verif_receta, 0)

        # 6. Escribir Confirmación booleana si está activada
        conf_leida = None
        if enviar_confirmacion:
            print(f"\n[3/3] Escribiendo Confirmación={valor_confirmacion} en DB48.DBX4.0 (Offset 4.0)...")
            # Para no sobreescribir otros bits en el byte 4, primero leemos el byte actual
            byte4 = plc.db_read(db_number=48, start=4, size=1)
            # Modificamos solo el bit 0 (DB48.DBX4.0)
            set_bool(byte4, 0, 0, valor_confirmacion)
            plc.db_write(db_number=48, start=4, data=byte4)

            # Leer de vuelta para verificación
            byte4_verif = plc.db_read(db_number=48, start=4, size=1)
            conf_leida = get_bool(byte4_verif, 0, 0)
        else:
            print("\n[3/3] Paso de confirmación omitido (desactivado por el usuario).")

        # 7. Resumen Final
        print("\n" + "=" * 75)
        print(" [RESULTADO DE LA OPERACIÓN EN EL PLC]:")
        print(f"   DB48.DBW2 (nModeloCamara): Escrito={receta} | Verificado en PLC={receta_leida} " +
              ("✔ OK" if receta_leida == receta else "❌ DISCREPANCIA"))

        if enviar_confirmacion:
            print(f"   DB48.DBX4.0 (bResultadoOK): Escrito={valor_confirmacion} | Verificado en PLC={conf_leida} " +
                  ("✔ OK" if conf_leida == valor_confirmacion else "❌ DISCREPANCIA"))
        else:
            print("   DB48.DBX4.0 (bResultadoOK): [NO MODIFICADO - DESACTIVADO]")
        print("=" * 75)

    except Exception as ex:
        print(f"\n[ERROR DE COMUNICACIÓN]: {ex}")
    finally:
        if plc.get_connected():
            plc.disconnect()
        plc.destroy()

if __name__ == "__main__":
    main()
