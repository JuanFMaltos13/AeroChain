# AeroChain
Aplicación descentralizada de reservación de vuelo construida en Solana usando Rust, Anchor y React

<img width="1080" height="1080" alt="FB_IMG_1709686996003" src="https://github.com/user-attachments/assets/4ee0f914-c5d8-453e-87c1-c45741623e1e" />

Bienvenidos a AeroChain una aplicación funcional de reservación de vuelos sobre Solana, utilizando Rust, Anchor, PDAs, TypeScript y una interfaz web conectada a una wallet.
Mi propuesta es construirlo con un enfoque de ingeniería de software: que no sea solamente una demostración visual, sino un proyecto que puedas ejecutar, explicar, probar y defender durante la evaluación.

**1. Arquitectura propuesta**
Componente	      | Tecnología	  | Responsabilidad
------------------|---------------|--------------------------------------
Programa on-chain	| Rust + Anchor	| Reglas de negocio y operaciones
Blockchain	      | Solana Devnet	| Almacenamiento y transacciones
Cuentas	          | PDAs	        | Administración de vuelos y pasajeros
IDL	              | Anchor IDL	  | Contrato entre programa y cliente
Cliente	          | TypeScript	  | Comunicación con Solana
Frontend	        | React + Vite	| Reservaciones y administración
Wallet	          | Solana Wallet | Adapter	Conexión y firma de transacciones

  **Modelo de cuentas**
<img width="1100" height="477" alt="image" src="https://github.com/user-attachments/assets/3a4aaa97-51ab-4b07-b49c-7243f049372a" />

  La regla principal será un máximo de nueve pasajeros por vuelo, validado directamente en Rust y no solamente en el frontend.

  **2. Funcionalidades y operaciones**
  El sistema tendrá dos perfiles principales:
- Administrador de vuelos: crea vuelos, modifica información, consulta pasajeros y cancela vuelos.
- Pasajero: consulta vuelos, reserva un asiento, consulta su reservación y cancela su propia reservación.

Las operaciones propuestas serán:
Operación	           | Instrucción Anchor  | Regla
---------------------|---------------------|------------------------------
Crear vuelo	         | create_flight       | Solo administrador autorizado
Consultar vuelo	     | getAccountInfo      | Lectura de la PDA
Modificar vuelo	     | update_flight	     | Solo autoridad del vuelo
Reservar asiento     | book_passenger	     | Máximo 9 pasajeros
Consultar pasajero	 | getAccountInfo	     | Verificar PDA y propietario
Modificar pasajero	 | update_passenger	   | Solo propietario
Cancelar reservación | cancel_booking	     | Solo propietario
Cancelar vuelo	     | cancel_flight	     | Autoridad y condiciones de cierre

**3. Aporte funcional propio**
Propongo que la mejora identificable sea un sistema de asignación y control de asientos con capacidad máxima de nueve pasajeros.
No será simplemente un contador visual.

La lógica estará implementada en Rust:
1. Cada reservación obtiene un asiento del 1 al 9.
2. El programa comprueba que el vuelo esté activo.
3. Rechaza una décima reservación.
4. Impide asignar dos veces el mismo asiento.
5. Al cancelar una reservación, libera el asiento.
6. El asiento liberado puede volver a reservarse.

El caso de prueba más importante será intentar reservar un décimo pasajero y demostrar que la transacción es rechazada por el programa, incluso si alguien intenta evitar las validaciones del frontend.
También incorporaremos una condición de baja: un vuelo no podrá cerrarse mientras conserve pasajeros activos. Primero deberán cancelarse sus reservaciones.

**4. Relación con las pruebas y evidencias**
Caso de evaluación	|    Prueba en AeroChain	              |    Evidencia
--------------------|---------------------------------------|---------------------------
Creación	          | Crear vuelo	                          | Firma y transacción
Lectura	            | Consultar vuelo y pasajeros	          | Datos de las cuentas
Modificación	      | Cambiar horario o destino	            | Estado anterior y nuevo
Autoridad	          | Usuario no autorizado                 | intenta modificar	Transacción rechazada
Pertenencia	        | Intentar modificar pasajero ajeno	    | Transacción rechazada
Capacidad	          | Reservar nueve pasajeros	            | Nueve cuentas asociadas
Validación	        | Intentar reservar el décimo	          | Error de capacidad
Baja	              | Cancelar reservación	                | Cuenta cerrada y asiento liberado
Cierre condicionado	| Cancelar vuelo con pasajeros activos	| Rechazo; después, cierre permitido

Esta matriz permitirá relacionar directamente las pruebas con los requisitos de evaluación, sin depender de los nombres de las operaciones originales del curso.

**6. Reglas técnicas importantes** 
Las cuentas tendrán estas relaciones:
- Flight PDA: semillas ["flight", flight_id].
- Passenger PDA: semillas ["passenger", flight, passenger_wallet].
Cada pasajero estará vinculado criptográficamente a su vuelo y a su wallet. El programa verificará estas relaciones mediante las restricciones de Anchor.

También tendremos:
- has_one para validar autoridades y propietarios.
- close para recuperar el rent al cancelar una cuenta.
- Validaciones de estado para impedir reservas en vuelos cancelados.
- Confirmación de transacciones y actualización de la interfaz después de su ejecución.


**7. Plan de implementación y entrega**
Programa Rust / Anchor
Cuentas, PDAs, instrucciones, permisos, errores y pruebas unitarias.

IDL y cliente TypeScript
Generación del IDL y cliente compatible con la versión compilada del programa.

Frontend React
Wallet Adapter, catálogo de vuelos, formulario de pasajeros y administración de reservaciones.

Devnet
Despliegue, creación de vuelos y ejecución de transacciones reales firmadas.

Evidencias y documentación
README, matriz de pruebas, enlaces a Solscan, capturas y guion para la demo de 60–90 segundos.

  
