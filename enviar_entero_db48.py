import sys
import snap7
from snap7.util import set_int, get_int

def main():
    print("=" * 70)
    print("   ESCRITURA DIRECTA A SIEMENS S7-1500 - DB48.DBW2 (nModeloCamara)")
    print("=" * 70)
    
    # Obtener IP
    if len(sys.argv) > 1:
        ip = sys.argv[1].strip()
    else:
        ip = input(">> Ingrese la IP del PLC Siemens (ejemplo 192.168.1.50): ").strip()
        if not ip:
            print("[ERROR] Debe ingresar una dirección IP.")
            return

    # Obtener Entero a enviar
    if len(sys.argv) > 2:
        try:
            valor = int(sys.argv[2].strip())
        except ValueError:
            print(f"[ERROR] '{sys.argv[2]}' no es un número entero válido.")
            return
    else:
        val_str = input(">> Ingrese el número entero a enviar a DB48.DBW2 (ejemplo 24): ").strip()
        try:
            valor = int(val_str)
        except ValueError:
            print(f"[ERROR] '{val_str}' no es un número entero válido.")
            return

    # Validar rango de Int de 16 bits (-32768 a 32767)
    if valor < -32768 or valor > 32767:
        print(f"[ERROR] En Siemens, 'Int' es de 16 bits (-32768 a 32767). El valor {valor} está fuera de rango.")
        return

    # Conectar al PLC S7-1500 (Rack 0, Slot 1, Puerto 102)
    plc = snap7.client.Client()
    try:
        print(f"\n[1/3] Conectando al PLC en {ip}:102 (S7-1500: Rack=0, Slot=1)...")
        plc.connect(ip, rack=0, slot=1, tcp_port=102)

        if not plc.get_connected():
            print(f"[ERROR] No se pudo establecer enlace S7 con {ip}:102")
            print("  Verifique:")
            print("  - Que el cable de red esté conectado y en la misma subred.")
            print("  - Que en TIA Portal esté marcada la opción 'Permit access with PUT/GET'.")
            return

        print("[OK] Conexión S7 establecida correctamente.")

        # Leer valor actual en DB48 offset 2 (2 bytes)
        print("\n[2/3] Leyendo valor actual en DB48.DBW2...")
        try:
            buf_lectura = plc.db_read(db_number=48, start=2, size=2)
            valor_anterior = get_int(buf_lectura, 0)
            print(f"  -> Valor previo en DB48.DBW2: {valor_anterior}")
        except Exception as e:
            print(f"  [Aviso] No se pudo leer valor previo: {e}")

        # Escribir el nuevo entero en DB48 offset 2
        print(f"\n[3/3] Escribiendo entero {valor} en DB48.DBW2 (Offset 2.0)...")
        buf_escritura = bytearray(2)
        set_int(buf_escritura, 0, valor)
        plc.db_write(db_number=48, start=2, data=buf_escritura)

        # Verificación leyendo nuevamente
        buf_verificacion = plc.db_read(db_number=48, start=2, size=2)
        valor_verificado = get_int(buf_verificacion, 0)

        print("\n" + "=" * 70)
        if valor_verificado == valor:
            print(f" [¡ÉXITO TOTAL!] Variable escrita y confirmada en el PLC:")
            print(f"   DB:       DB48 (Camara_Receta_DB)")
            print(f"   Variable: nModeloCamara (Offset 2.0 / DB48.DBW2)")
            print(f"   Tipo:     Int (16 bits)")
            print(f"   Valor:    {valor_verificado}")
        else:
            print(f" [DISCREPANCIA] Se escribió {valor}, pero el PLC devolvió {valor_verificado}")
        print("=" * 70)

    except Exception as ex:
        print(f"\n[ERROR DURANTE LA COMUNICACIÓN]: {ex}")
    finally:
        if plc.get_connected():
            plc.disconnect()
        plc.destroy()

if __name__ == "__main__":
    main()
