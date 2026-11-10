import type { CapacitorConfig } from '@capacitor/cli';

// Para empaquetar en Android con Capacitor. El proxy funciona solo con ionic serve.
// Para APK nativo es necesario configurar una API accesible desde el dispositivo
// y permitir HTTP local si el servidor de clase no dispone de HTTPS.
const config: CapacitorConfig = {
  appId: 'co.edu.uberapp.proyecto',
  appName: 'UBER APP',
  webDir: 'www',
};

export default config;
