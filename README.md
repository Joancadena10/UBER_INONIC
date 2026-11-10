# UBER APP — Ionic 9 + Angular 22

Proyecto de movilidad académica migrado desde Angular puro a **Ionic Angular**, conservando los módulos de cliente, conductor y administrador, sus endpoints REST de Laravel 12 y mapas Leaflet/OpenStreetMap.

## Requisitos

- Node.js compatible con Angular 22 (Node 22.22.3+ o Node 24.15+).
- npm y acceso a Internet **durante la primera instalación de paquetes**.
- Ionic CLI: `npm install -g @ionic/cli` (si no lo tienes).
- Para usar el backend del profesor debes estar conectado a su red y su servidor debe responder en `20.20.1.22:8000`.

## Ejecutar en VS Code

Abre esta carpeta `UBER-IONIC` en VS Code y ejecuta:

```powershell
npm install
ionic serve
```

**IMPORTANTE:** No incluyas un script `ionic:serve` que invoque de nuevo a `ionic serve`: produce un bucle infinito. El CLI de Ionic ejecuta directamente el target `app:serve` de Angular. Ya está configurado `proxyConfig` en `angular.json`: no necesitas añadir argumentos especiales. El proxy envía `/api` a `http://20.20.1.22:8000`.

Para exponer a teléfonos conectados al mismo Wi-Fi:

```powershell
ionic serve --external
```

Si `ionic serve` no funciona por algún problema del CLI global, usa `npm run serve:lan` (la app sigue siendo Ionic + Angular).

Abre la URL `http://IP-DE-TU-PC:8100` (puerto informado por Ionic CLI) desde el teléfono. En algunos equipos Ionic usa otro puerto: fíjate en la salida de la terminal. Si hay firewall, permite el acceso de Node.js a la red privada o institucional.

## Arquitectura Ionic

- `src/app/app.ts`: shell nativa de Ionic (`IonApp` + `IonRouterOutlet`).
- `src/app/app.config.ts`: `provideIonicAngular`, `IonicRouteStrategy`, `HttpClient`.
- `src/app/pages/login`: login con `IonContent`, `IonInput` e `IonButton`.
- `src/app/pages/cliente`: mapa Leaflet, cotización y solicitud.
- `src/app/pages/conductor`: disponibilidad, solicitudes, aceptación y etapas del viaje, GPS. Actualiza solicitudes cada 4 segundos cuando el conductor está disponible y la página está activa; también puede deslizar hacia abajo para refrescar.
- `src/app/pages/administrador`: revisión de conductores, tarifas, reportes.
- `src/proxy.conf.json`: dirección del backend del profesor.
- `ionic.config.json`: reconoce el proyecto como Ionic Angular.
- `capacitor.config.ts`: preparación para un APK posterior (todavía sin carpeta `android/`).

## Prueba funcional de dos dispositivos

1. En PC abre sesión como **cliente**.
2. En celular conectado al mismo Wi-Fi abre la URL que muestra `ionic serve --external` y entra como conductor **Héctor Fabio**.
3. El conductor pulsa **Activar servicio** y debe estar aprobado en la API.
4. El cliente selecciona origen/destino y solicita transporte.
5. El conductor ve la solicitud cuando se actualiza cada cuatro segundos (o deslizando hacia abajo) y pulsa **Aceptar viaje**.
6. Registra llegada, inicio y finalización del viaje.

## Notas técnicas

- Ionic **usa Angular**. La migración conserva TypeScript, rutas y servicios de Angular y cambia el framework de interfaz a Ionic.
- El proxy del servidor de desarrollo funciona para el teléfono **solo cuando accede por la URL del PC** y no desde una build estática abierta con `file://`.
- Para GPS web en teléfono suele requerirse **HTTPS**. En HTTP local algunos navegadores no permiten geolocalización; el mapa sí puede usarse manualmente.
- Para construir un APK real con Capacitor se debe adaptar el acceso a `/api` al host alcanzable desde el Android (el proxy solo corre en desarrollo), habilitar acceso HTTP local o usar HTTPS, e instalar plataforma Android con el SDK. Este ZIP todavía **no incluye un APK ni la plataforma nativa Android**.
- No se deben inventar credenciales admin ni modificar roles localmente. Los permisos los valida Laravel.
- No compartas contraseñas ni tokens reales en GitHub.

## Entrega

Se incluye código fuente, configuración de Ionic y recursos del proyecto. `node_modules`, caché `.angular`, artefactos de compilación y `.git` se excluyeron del ZIP porque se regeneran y no son necesarios para evaluación.
