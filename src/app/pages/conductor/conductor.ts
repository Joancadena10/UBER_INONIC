import { Router } from '@angular/router';
import { IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonRefresher, IonRefresherContent } from '@ionic/angular';

import {
  Component,
  OnInit,
  AfterViewInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  ChangeDetectorRef,
  inject
} from '@angular/core';

import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import * as L from 'leaflet';

interface Solicitud {
  id: number;
  origin_name: string;
  destination_name: string;
  estimated_distance_km: number;
  estimated_fare: number;
  client?: {
    name: string;
    phone?: string;
  };
}

interface Viaje {
  id: number;
  request_id?: number;
  status: string;
  estimated_fare?: number;
  final_fare?: number;
}

type Disponibilidad = 'available' | 'unavailable' | 'unknown';
type AccionViaje = 'arrive' | 'start' | 'complete';

@Component({
  selector: 'app-conductor',
  imports: [CurrencyPipe, FormsModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonRefresher, IonRefresherContent],
  templateUrl: './conductor.html',
  styleUrl: './conductor.css'
})
export class Conductor implements OnInit, AfterViewInit, OnDestroy {
  cerrarSesion(): void {
    sessionStorage.removeItem('uber_token');
    sessionStorage.removeItem('uber_rol');
    sessionStorage.removeItem('uber_nombre');
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }


  @ViewChild('mapaConductor')
  mapaContenedor?: ElementRef<HTMLDivElement>;

  private router = inject(Router);
  private http = inject(HttpClient);
  private cd = inject(ChangeDetectorRef);

  private mapa?: L.Map;
  private marcadorGPS?: L.CircleMarker;
  private gpsWatchId: number | null = null;
  private ultimoEnvioMs = 0;
  private destruido = false;
  private temporizadorSolicitudes: ReturnType<typeof setInterval> | null = null;

  tieneAcceso = false;
  nombre = '';

  disponibilidad: Disponibilidad = 'unknown';

  solicitudes: Solicitud[] = [];
  viaje: Viaje | null = null;

  cargandoSolicitudes = false;
  cambiandoDisponibilidad = false;
  procesandoViaje = false;

  gpsActivo = false;
  enviandoUbicacion = false;

  latitud: number | null = null;
  longitud: number | null = null;
  ultimaActualizacion = '';

  distanciaReal: number | null = null;
  duracionReal: number | null = null;

  mensaje = '';
  tipoMensaje: 'exito' | 'error' = 'exito';

  ngOnInit(): void {
    const token = sessionStorage.getItem('uber_token');
    const rol = sessionStorage.getItem('uber_rol');

    this.tieneAcceso = !!token && rol === 'driver';
    this.nombre = sessionStorage.getItem('uber_nombre') || 'Conductor';

    if (this.tieneAcceso) {
      this.consultarSolicitudes();
    }
  }

  ngAfterViewInit(): void {
    if (!this.tieneAcceso || !this.mapaContenedor) {
      return;
    }

    this.mapa = L.map(
      this.mapaContenedor.nativeElement
    ).setView([2.9273, -75.2819], 13);

    L.tileLayer(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }
    ).addTo(this.mapa);
  }

  ionViewWillEnter(): void {
    this.mapa && setTimeout(() => this.mapa?.invalidateSize(), 250);
    if (this.tieneAcceso && !this.temporizadorSolicitudes) {
      this.temporizadorSolicitudes = setInterval(() => {
        if (this.disponibilidad === 'available' && !this.cargandoSolicitudes && !this.procesandoViaje) {
          this.consultarSolicitudes(true);
        }
      }, 4000);
    }
  }

  ionViewWillLeave(): void {
    this.detenerConsultas();
  }

  private detenerConsultas(): void {
    if (this.temporizadorSolicitudes) {
      clearInterval(this.temporizadorSolicitudes);
      this.temporizadorSolicitudes = null;
    }
  }

  refrescar(evento: CustomEvent): void {
    this.consultarSolicitudes();
    // Completar animación incluso ante API lenta.
    setTimeout(() => (evento.target as HTMLIonRefresherElement)?.complete(), 900);
  }

  ngOnDestroy(): void {
    this.detenerConsultas();
    this.destruido = true;
    this.detenerGPS();
    this.mapa?.remove();
  }

  private opciones() {
    return {
      headers: {
        Authorization: `Bearer ${sessionStorage.getItem('uber_token') || ''}`,
        Accept: 'application/json'
      },
      timeout: 12000
    };
  }

  private explicarError(err: HttpErrorResponse): string {
    const mensajeServidor = err.error?.message;

    if (typeof mensajeServidor === 'string') {
      return mensajeServidor;
    }

    if (err.status === 401) {
      return 'Tu sesión expiró. Inicia sesión nuevamente.';
    }

    if (err.status === 403) {
      return 'No tienes permisos o tu cuenta de conductor no está aprobada.';
    }

    if (err.status === 0) {
      return 'No se recibió respuesta del servidor.';
    }

    return `Error de la API: HTTP ${err.status}`;
  }

  private notificar(
    mensaje: string,
    tipo: 'exito' | 'error' = 'exito'
  ): void {
    this.mensaje = mensaje;
    this.tipoMensaje = tipo;
    this.cd.markForCheck();
  }

  // CAMBIAR DISPONIBILIDAD
  cambiarDisponibilidad(
    estado: 'available' | 'unavailable'
  ): void {
    if (!this.tieneAcceso || this.cambiandoDisponibilidad) {
      return;
    }

    this.cambiandoDisponibilidad = true;

    this.http.put<{
      success: boolean;
      message: string;
      availability_status: 'available' | 'unavailable';
    }>(
      '/api/driver/availability',
      { status: estado },
      this.opciones()
    ).subscribe({
      next: respuesta => {
        this.cambiandoDisponibilidad = false;

        if (respuesta.success) {
          this.disponibilidad = respuesta.availability_status;
          this.notificar(respuesta.message);
          this.consultarSolicitudes();
        } else {
          this.notificar(
            'No fue posible actualizar tu disponibilidad.',
            'error'
          );
        }
      },

      error: (err: HttpErrorResponse) => {
        this.cambiandoDisponibilidad = false;
        this.notificar(this.explicarError(err), 'error');
      }
    });
  }

  // CONSULTAR SOLICITUDES DISPONIBLES
  consultarSolicitudes(silencioso = false): void {
    if (!this.tieneAcceso) return;

    this.cargandoSolicitudes = true;

    this.http.get<{
      success: boolean;
      requests: Solicitud[];
    }>(
      '/api/driver/ride-requests',
      this.opciones()
    ).subscribe({
      next: respuesta => {
        this.cargandoSolicitudes = false;
        this.solicitudes = respuesta.success
          ? (respuesta.requests || [])
          : [];

        this.cd.markForCheck();
      },

      error: (err: HttpErrorResponse) => {
        this.cargandoSolicitudes = false;
        if (!silencioso) this.notificar(this.explicarError(err), 'error');
        this.cd.markForCheck();
      }
    });
  }

  // ACEPTAR UNA SOLICITUD
  aceptarSolicitud(id: number): void {
    if (this.procesandoViaje) return;

    if (this.viaje && this.viaje.status !== 'completed') {
      this.notificar(
        'Ya tienes un viaje en este panel.',
        'error'
      );
      return;
    }

    this.procesandoViaje = true;

    this.http.post<{
      success: boolean;
      message: string;
      trip: Viaje;
    }>(
      `/api/driver/ride-requests/${id}/accept`,
      {},
      this.opciones()
    ).subscribe({
      next: respuesta => {
        this.procesandoViaje = false;

        if (respuesta.success && respuesta.trip) {
          this.viaje = respuesta.trip;
          this.solicitudes = this.solicitudes.filter(
            solicitud => solicitud.id !== id
          );
          this.notificar(respuesta.message);
        } else {
          this.notificar('No se pudo aceptar el viaje.', 'error');
        }
      },

      error: (err: HttpErrorResponse) => {
        this.procesandoViaje = false;
        this.notificar(this.explicarError(err), 'error');
      }
    });
  }

  // LLEGADA, INICIO Y FINALIZACIÓN DEL VIAJE
  actualizarViaje(accion: AccionViaje): void {
    if (!this.viaje || this.procesandoViaje) return;

    let datos: Record<string, number> = {};

    if (accion === 'complete') {
      const distancia = this.distanciaReal;
      const duracion = this.duracionReal;

      if (
        distancia === null ||
        duracion === null ||
        !Number.isFinite(distancia) ||
        !Number.isFinite(duracion) ||
        distancia <= 0 ||
        duracion <= 0
      ) {
        this.notificar(
          'Ingresa una distancia y duración válidas.',
          'error'
        );
        return;
      }

      datos = {
        actual_distance_km: distancia,
        actual_duration_min: duracion
      };
    }

    const id = this.viaje.id;
    this.procesandoViaje = true;

    this.http.post<{
      success: boolean;
      message: string;
      trip: Viaje;
    }>(
      `/api/driver/trips/${id}/${accion}`,
      datos,
      this.opciones()
    ).subscribe({
      next: respuesta => {
        this.procesandoViaje = false;

        if (respuesta.success && respuesta.trip) {
          this.viaje = {
            ...this.viaje!,
            ...respuesta.trip
          };

          this.notificar(respuesta.message);

          if (accion === 'complete') {
            this.detenerGPS();
            this.consultarSolicitudes();
          }
        } else {
          this.notificar('No se pudo actualizar el viaje.', 'error');
        }
      },

      error: (err: HttpErrorResponse) => {
        this.procesandoViaje = false;
        this.notificar(this.explicarError(err), 'error');
      }
    });
  }

  // ACTIVAR SEGUIMIENTO GPS CON PERMISO DEL CONDUCTOR
  iniciarGPS(): void {
    if (!this.tieneAcceso || this.gpsActivo) return;

    if (!navigator.geolocation) {
      this.notificar(
        'Este navegador no admite geolocalización.',
        'error'
      );
      return;
    }

    this.gpsActivo = true;
    this.mensaje = '';

    this.gpsWatchId = navigator.geolocation.watchPosition(
      posicion => {
        if (this.destruido) return;

        const lat = posicion.coords.latitude;
        const lng = posicion.coords.longitude;

        this.latitud = Number(lat.toFixed(6));
        this.longitud = Number(lng.toFixed(6));

        this.ultimaActualizacion =
          new Date().toLocaleTimeString('es-CO');

        this.actualizarMapaGPS(lat, lng);

        // Limita los envíos aproximadamente a uno cada 10 segundos.
        if (
          Date.now() - this.ultimoEnvioMs >= 10000 &&
          !this.enviandoUbicacion
        ) {
          this.ultimoEnvioMs = Date.now();
          this.enviarUbicacion(lat, lng);
        }

        this.cd.markForCheck();
      },

      error => {
        const detalle = error.code === 1
          ? 'Debes permitir el acceso a tu ubicación.'
          : 'No se pudo obtener la posición GPS.';

        this.detenerGPS();
        this.notificar(detalle, 'error');
      },

      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000
      }
    );
  }

  detenerGPS(): void {
    if (this.gpsWatchId !== null) {
      navigator.geolocation.clearWatch(this.gpsWatchId);
      this.gpsWatchId = null;
    }

    this.gpsActivo = false;
    this.cd.markForCheck();
  }

  private actualizarMapaGPS(lat: number, lng: number): void {
    if (!this.mapa) return;

    if (!this.marcadorGPS) {
      this.marcadorGPS = L.circleMarker([lat, lng], {
        radius: 11,
        color: 'white',
        weight: 3,
        fillColor: '#2563eb',
        fillOpacity: 1
      }).addTo(this.mapa).bindPopup('Mi ubicación GPS');
    } else {
      this.marcadorGPS.setLatLng([lat, lng]);
    }

    this.mapa.setView([lat, lng], 16);
  }

  // ENVIAR UBICACIÓN AL BACKEND LARAVEL
  private enviarUbicacion(lat: number, lng: number): void {
    if (!this.tieneAcceso) return;

    this.enviandoUbicacion = true;

    const datos: {
      latitude: number;
      longitude: number;
      trip_id?: number;
    } = {
      latitude: lat,
      longitude: lng
    };

    if (
      this.viaje &&
      ['assigned', 'driver_arrived', 'in_progress']
        .includes(this.viaje.status)
    ) {
      datos.trip_id = this.viaje.id;
    }

    this.http.post<{
      success: boolean;
      location?: {
        latitude: number;
        longitude: number;
      };
    }>(
      '/api/driver/location',
      datos,
      this.opciones()
    ).subscribe({
      next: respuesta => {
        this.enviandoUbicacion = false;

        if (!respuesta.success) {
          this.notificar(
            'El backend no confirmó la ubicación.',
            'error'
          );
        }

        this.cd.markForCheck();
      },

      error: (err: HttpErrorResponse) => {
        this.enviandoUbicacion = false;
        this.notificar(this.explicarError(err), 'error');
      }
    });
  }
}
