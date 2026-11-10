import { Router } from '@angular/router';
import { IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent } from '@ionic/angular';

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

import { FormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import * as L from 'leaflet';

type TipoPunto = 'origen' | 'destino';

interface Tarifa {
  id: number;
  name: string;
  base_fare: number;
  price_per_km: number;
  price_per_minute: number;
  minimum_fare: number;
  surge_multiplier: number;
  active: boolean;
}

interface Estimacion {
  distance_km: number;
  duration_min: number;
  estimated_fare: number;
  currency: string;
}

interface DireccionOSM {
  display_name?: string;
  address?: {
    road?: string;
    pedestrian?: string;
    house_number?: string;
    neighbourhood?: string;
    suburb?: string;
    quarter?: string;
    city?: string;
    town?: string;
    municipality?: string;
    village?: string;
  };
}

@Component({
  selector: 'app-cliente',
  imports: [FormsModule, CurrencyPipe, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent],
  templateUrl: './cliente.html',
  styleUrl: './cliente.css'
})
export class Cliente implements OnInit, AfterViewInit, OnDestroy {
  cerrarSesion(): void {
    sessionStorage.removeItem('uber_token');
    sessionStorage.removeItem('uber_rol');
    sessionStorage.removeItem('uber_nombre');
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }


  @ViewChild('mapaContenedor')
  mapaContenedor!: ElementRef<HTMLDivElement>;

  private router = inject(Router);
  private http = inject(HttpClient);
  private cd = inject(ChangeDetectorRef);

  private mapa?: L.Map;
  private marcadorOrigen?: L.CircleMarker;
  private marcadorDestino?: L.CircleMarker;
  private linea?: L.Polyline;

  // Control de consultas de direcciones
  private colaDirecciones: Promise<void> = Promise.resolve();
  private ultimaConsulta = 0;
  private destruido = false;

  private versionDireccion = {
    origen: 0,
    destino: 0
  };

  seleccion: TipoPunto = 'origen';

  // FORMULARIO
  origen = '';
  destino = '';

  origenLat: number | null = null;
  origenLng: number | null = null;
  destinoLat: number | null = null;
  destinoLng: number | null = null;

  // API
  tarifa: Tarifa | null = null;
  estimacion: Estimacion | null = null;

  cargandoTarifa = false;
  cargandoGPS = false;
  calculando = false;
  solicitando = false;

  errorTarifa = '';
  mensaje = '';
  tipoMensaje: 'exito' | 'error' = 'error';

  solicitudId: number | null = null;

  ngOnInit(): void {
    this.consultarTarifa();
  }

  ngAfterViewInit(): void {
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

    this.mapa.on('click', (evento: L.LeafletMouseEvent) => {
      this.colocarPunto(
        evento.latlng.lat,
        evento.latlng.lng
      );
    });
  }

  ionViewDidEnter(): void {
    setTimeout(() => this.mapa?.invalidateSize(), 250);
  }

  ngOnDestroy(): void {
    this.destruido = true;
    this.mapa?.remove();
  }

  seleccionar(tipo: TipoPunto): void {
    this.seleccion = tipo;
  }

  // SELECCIÓN AUTOMÁTICA DESDE EL MAPA
  colocarPunto(lat: number, lng: number): void {

    const tipo = this.seleccion;

    lat = Number(lat.toFixed(6));
    lng = Number(lng.toFixed(6));

    if (tipo === 'origen') {

      this.origenLat = lat;
      this.origenLng = lng;

      this.origen = `Punto de recogida (${lat}, ${lng})`;

      // Después de origen, se selecciona destino
      this.seleccion = 'destino';

    } else {

      this.destinoLat = lat;
      this.destinoLng = lng;

      this.destino = `Destino seleccionado (${lat}, ${lng})`;

    }

    this.invalidarEstimacion();
    this.actualizarMarcadores();

    // Buscar automáticamente el nombre del lugar
    this.buscarDireccion(tipo, lat, lng);

    this.cd.markForCheck();
  }

  // CONVERTIR COORDENADAS GPS EN DIRECCIÓN
  private buscarDireccion(
    tipo: TipoPunto,
    lat: number,
    lng: number
  ): void {

    const version = ++this.versionDireccion[tipo];

    // Cola para respetar el límite del servicio público
    this.colaDirecciones = this.colaDirecciones
      .catch(() => {})
      .then(async () => {

        const espera = Math.max(
          0,
          1100 - (Date.now() - this.ultimaConsulta)
        );

        if (espera > 0) {
          await new Promise<void>(resolver =>
            setTimeout(resolver, espera)
          );
        }

        if (
          this.destruido ||
          version !== this.versionDireccion[tipo]
        ) {
          return;
        }

        this.ultimaConsulta = Date.now();

        const url =
          'https://nominatim.openstreetmap.org/reverse' +
          '?format=jsonv2' +
          '&addressdetails=1' +
          '&zoom=18' +
          '&accept-language=es' +
          `&lat=${lat}&lon=${lng}`;

        try {

          const respuesta = await firstValueFrom(
            this.http.get<DireccionOSM>(url, {
              timeout: 8000
            })
          );

          if (
            this.destruido ||
            version !== this.versionDireccion[tipo]
          ) {
            return;
          }

          const a = respuesta.address;

          const calle = [
            a?.road || a?.pedestrian,
            a?.house_number
          ].filter(Boolean).join(' ');

          const sector =
            a?.neighbourhood ||
            a?.suburb ||
            a?.quarter;

          const ciudad =
            a?.city ||
            a?.town ||
            a?.municipality ||
            a?.village;

          const nombre = [
            calle,
            sector,
            ciudad
          ].filter(Boolean).join(', ');

          const direccion =
            nombre ||
            respuesta.display_name
              ?.split(',')
              .slice(0, 3)
              .join(', ') ||
            `Ubicación (${lat}, ${lng})`;

          if (tipo === 'origen') {
            this.origen = direccion;
          } else {
            this.destino = direccion;
          }

          this.cd.markForCheck();

        } catch {
          // Se conservan las coordenadas exactas
          // aunque no se encuentre una dirección.
        }
      });
  }

  // OBTENER UBICACIÓN GPS DEL CLIENTE
  usarMiUbicacion(): void {

    if (!navigator.geolocation) {
      this.mostrarError('El navegador no admite GPS.');
      return;
    }

    this.cargandoGPS = true;
    this.mensaje = '';

    navigator.geolocation.getCurrentPosition(
      posicion => {

        const lat = posicion.coords.latitude;
        const lng = posicion.coords.longitude;

        this.seleccion = 'origen';
        this.colocarPunto(lat, lng);

        this.mapa?.setView([lat, lng], 16);

        this.cargandoGPS = false;
        this.cd.markForCheck();
      },
      error => {
        this.cargandoGPS = false;

        this.mostrarError(
          error.code === 1
            ? 'Debes permitir el acceso al GPS.'
            : 'No fue posible obtener tu ubicación.'
        );

        this.cd.markForCheck();
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000
      }
    );
  }

  cambioCoordenadas(): void {
    this.versionDireccion.origen++;
    this.versionDireccion.destino++;

    this.invalidarEstimacion();
    this.actualizarMarcadores();
  }

  invalidarEstimacion(): void {
    this.estimacion = null;
    this.solicitudId = null;
    this.mensaje = '';
  }

  private puntoValido(
    lat: number | null,
    lng: number | null
  ): boolean {
    return lat !== null &&
      lng !== null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180;
  }

  coordenadasValidas(): boolean {
    return this.puntoValido(this.origenLat, this.origenLng) &&
      this.puntoValido(this.destinoLat, this.destinoLng);
  }

  // ACTUALIZAR MARCADORES EN EL MAPA
  private actualizarMarcadores(): void {

    if (!this.mapa) return;

    this.marcadorOrigen?.remove();
    this.marcadorDestino?.remove();
    this.linea?.remove();

    const origenOk = this.puntoValido(
      this.origenLat,
      this.origenLng
    );

    const destinoOk = this.puntoValido(
      this.destinoLat,
      this.destinoLng
    );

    if (origenOk) {
      this.marcadorOrigen = L.circleMarker(
        [this.origenLat!, this.origenLng!],
        {
          radius: 10,
          color: '#fff',
          weight: 3,
          fillColor: '#16a34a',
          fillOpacity: 1
        }
      )
      .addTo(this.mapa)
      .bindPopup('Origen');
    }

    if (destinoOk) {
      this.marcadorDestino = L.circleMarker(
        [this.destinoLat!, this.destinoLng!],
        {
          radius: 10,
          color: '#fff',
          weight: 3,
          fillColor: '#111827',
          fillOpacity: 1
        }
      )
      .addTo(this.mapa)
      .bindPopup('Destino');
    }

    if (origenOk && destinoOk) {

      const inicio: L.LatLngExpression = [
        this.origenLat!,
        this.origenLng!
      ];

      const fin: L.LatLngExpression = [
        this.destinoLat!,
        this.destinoLng!
      ];

      this.linea = L.polyline(
        [inicio, fin],
        {
          color: '#2563eb',
          weight: 3,
          dashArray: '7,9'
        }
      ).addTo(this.mapa);

      this.mapa.fitBounds(
        L.latLngBounds([inicio, fin]),
        {
          padding: [45, 45],
          maxZoom: 16
        }
      );
    }
  }

  // CONSULTAR TARIFAS DEL PROFESOR
  consultarTarifa(): void {

    this.cargandoTarifa = true;
    this.errorTarifa = '';

    this.http.get<{
      success: boolean;
      fare: Tarifa;
    }>('/api/fares/active', {
      timeout: 12000
    }).subscribe({

      next: respuesta => {
        this.cargandoTarifa = false;

        this.tarifa = respuesta.success
          ? respuesta.fare
          : null;

        if (!this.tarifa) {
          this.errorTarifa = 'No hay tarifa disponible.';
        }

        this.cd.markForCheck();
      },

      error: (err: HttpErrorResponse) => {
        this.cargandoTarifa = false;
        this.errorTarifa =
          `Error al consultar tarifas: HTTP ${err.status}`;

        this.cd.markForCheck();
      }
    });
  }

  private token(): string | null {
    return sessionStorage.getItem('uber_token');
  }

  private datosCoordenadas() {
    return {
      origin_latitude: this.origenLat,
      origin_longitude: this.origenLng,
      destination_latitude: this.destinoLat,
      destination_longitude: this.destinoLng
    };
  }

  // CALCULAR TARIFA DEL RECORRIDO
  calcularViaje(): void {

    this.invalidarEstimacion();

    if (!this.origen.trim() || !this.destino.trim()) {
      this.mostrarError('Selecciona origen y destino.');
      return;
    }

    if (!this.coordenadasValidas()) {
      this.mostrarError('Selecciona dos puntos válidos.');
      return;
    }

    const token = this.token();

    if (!token) {
      this.mostrarError('Inicia sesión primero.');
      return;
    }

    this.calculando = true;

    this.http.post<{
      success: boolean;
      estimate: Estimacion;
    }>(
      '/api/client/estimate-fare',
      this.datosCoordenadas(),
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        },
        timeout: 12000
      }
    ).subscribe({

      next: respuesta => {

        this.calculando = false;

        if (respuesta.success && respuesta.estimate) {
          this.estimacion = respuesta.estimate;
        } else {
          this.mostrarError('No se pudo calcular.');
        }

        this.cd.markForCheck();
      },

      error: (err: HttpErrorResponse) => {
        this.calculando = false;

        this.mostrarError(
          err.error?.message ||
          `Error al calcular: HTTP ${err.status}`
        );

        this.cd.markForCheck();
      }
    });
  }

  // CONFIRMAR VIAJE EN LARAVEL
  solicitarViaje(): void {

    if (this.solicitando || !this.estimacion) return;

    if (!this.coordenadasValidas()) {
      this.mostrarError('Coordenadas inválidas.');
      return;
    }

    const token = this.token();

    if (!token) {
      this.mostrarError('Inicia sesión.');
      return;
    }

    this.solicitando = true;
    this.mensaje = '';

    this.http.post<{
      success: boolean;
      message: string;
      ride_request?: { id: number };
    }>(
      '/api/client/ride-requests',
      {
        origin_name: this.origen.trim(),
        destination_name: this.destino.trim(),
        ...this.datosCoordenadas()
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        },
        timeout: 12000
      }
    ).subscribe({

      next: respuesta => {

        this.solicitando = false;

        if (respuesta.success) {
          this.tipoMensaje = 'exito';
          this.mensaje =
            respuesta.message || 'Viaje registrado.';

          this.solicitudId =
            respuesta.ride_request?.id ?? null;

          this.estimacion = null;
        } else {
          this.mostrarError('No se pudo solicitar.');
        }

        this.cd.markForCheck();
      },

      error: (err: HttpErrorResponse) => {

        this.solicitando = false;

        this.mostrarError(
          err.error?.message ||
          `Error HTTP ${err.status}`
        );

        this.cd.markForCheck();
      }
    });
  }

  mostrarError(texto: string): void {
    this.tipoMensaje = 'error';
    this.mensaje = texto;
  }
}
