import { Router } from '@angular/router';
import { IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent } from '@ionic/angular';

import {
  Component,
  OnInit,
  ChangeDetectorRef,
  inject
} from '@angular/core';

import {
  CurrencyPipe,
  DatePipe,
  JsonPipe
} from '@angular/common';

import { FormsModule } from '@angular/forms';

import {
  HttpClient,
  HttpErrorResponse,
  HttpParams
} from '@angular/common/http';

type Pestana =
  | 'dashboard'
  | 'conductores'
  | 'tarifas'
  | 'viajes'
  | 'reportes'
  | 'auditoria';

type EstadoAprobacion =
  | 'approved'
  | 'rejected'
  | 'suspended';

interface Estadisticas {
  total_clients: number;
  total_drivers: number;
  pending_drivers: number;
  approved_drivers: number;
  active_trips: number;
  completed_trips: number;
  cancelled_trips: number;
  pending_requests: number;
  total_revenue: number;
}

interface Vehiculo {
  plate: string;
  brand: string;
  model: string;
  year: number;
  color?: string;
}

interface Conductor {
  id: number;
  license_number: string;
  approval_status: string;
  rating_average?: number;
  user: {
    name: string;
    email: string;
    phone?: string;
  };
  vehicles?: Vehiculo[];
}

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

interface Viaje {
  id: number;
  status: string;
  estimated_fare?: number;
  final_fare?: number;
  created_at?: string;
  completed_at?: string;
  client?: {
    name?: string;
    user?: { name: string };
  };
  driver?: {
    name?: string;
    user?: { name: string };
  };
  vehicle?: {
    plate?: string;
  };
}

@Component({
  selector: 'app-administrador',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    JsonPipe,
    FormsModule
  , IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent],
  templateUrl: './administrador.html',
  styleUrl: './administrador.css'
})
export class Administrador implements OnInit {
  cerrarSesion(): void {
    sessionStorage.removeItem('uber_token');
    sessionStorage.removeItem('uber_rol');
    sessionStorage.removeItem('uber_nombre');
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }


  private router = inject(Router);
  private http = inject(HttpClient);
  private cd = inject(ChangeDetectorRef);

  tieneAcceso = false;
  nombreAdmin = '';

  pestana: Pestana = 'dashboard';

  estadisticas: Estadisticas | null = null;
  conductores: Conductor[] = [];
  tarifas: Tarifa[] = [];
  viajes: Viaje[] = [];

  reporte: unknown = null;
  auditoria: unknown = null;

  cargandoResumen = false;
  cargandoConductores = false;
  cargandoTarifas = false;
  cargandoViajes = false;
  cargandoReportes = false;
  cargandoAuditoria = false;

  procesandoConductor: number | null = null;
  guardandoTarifa = false;

  mensaje = '';
  tipoMensaje: 'exito' | 'error' = 'exito';

  filtroConductores = 'todos';
  filtroViajes = 'todos';

  notas: Record<number, string> = {};

  nuevaTarifa = {
    name: '',
    base_fare: 3800,
    price_per_km: 1250,
    price_per_minute: 250,
    minimum_fare: 6500,
    surge_multiplier: 1,
    active: false
  };

  ngOnInit(): void {
    const rol = sessionStorage.getItem('uber_rol');
    const token = sessionStorage.getItem('uber_token');

    this.tieneAcceso = rol === 'admin' && !!token;
    this.nombreAdmin =
      sessionStorage.getItem('uber_nombre') || 'Administrador';

    if (this.tieneAcceso) {
      this.cargarResumen();
      this.consultarConductores();
    }
  }

  private opciones() {
    const token =
      sessionStorage.getItem('uber_token') || '';

    return {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      },
      timeout: 15000
    };
  }

  private manejarError(err: HttpErrorResponse): string {
    if (typeof err.error?.message === 'string') {
      return err.error.message;
    }

    if (err.status === 401) {
      return 'Tu sesión ha expirado. Inicia sesión nuevamente.';
    }

    if (err.status === 403) {
      return 'Tu usuario no tiene permisos para esta operación.';
    }

    if (err.status === 0) {
      return 'No se pudo obtener respuesta del servidor.';
    }

    return `Error del servidor: HTTP ${err.status}`;
  }

  private notificar(
    texto: string,
    tipo: 'exito' | 'error' = 'exito'
  ): void {
    this.mensaje = texto;
    this.tipoMensaje = tipo;
    this.cd.markForCheck();
  }

  limpiarMensaje(): void {
    this.mensaje = '';
  }

  // Normalizar listas de Laravel, con o sin paginación
  private leerLista<T>(
    respuesta: any,
    campo: string
  ): T[] {
    const datos =
      respuesta?.[campo] ??
      respuesta?.data ??
      respuesta;

    if (Array.isArray(datos)) {
      return datos;
    }

    if (Array.isArray(datos?.data)) {
      return datos.data;
    }

    return [];
  }

  // CAMBIAR ENTRE SECCIONES
  cambiarPestana(pestana: Pestana): void {
    this.pestana = pestana;
    this.limpiarMensaje();

    switch (pestana) {
      case 'dashboard':
        this.cargarResumen();
        break;

      case 'conductores':
        this.consultarConductores();
        break;

      case 'tarifas':
        this.consultarTarifas();
        break;

      case 'viajes':
        this.consultarViajes();
        break;

      case 'reportes':
        this.consultarReportes();
        break;

      case 'auditoria':
        this.consultarAuditoria();
        break;
    }
  }

  // 1. DASHBOARD ADMINISTRATIVO
  cargarResumen(): void {
    if (!this.tieneAcceso) return;

    this.cargandoResumen = true;

    this.http.get<{
      success: boolean;
      stats: Estadisticas;
    }>(
      '/api/admin/dashboard',
      this.opciones()
    ).subscribe({
      next: respuesta => {
        this.cargandoResumen = false;

        if (respuesta.success && respuesta.stats) {
          this.estadisticas = respuesta.stats;
        } else {
          this.notificar(
            'No fue posible consultar las estadísticas.',
            'error'
          );
        }

        this.cd.markForCheck();
      },

      error: (err: HttpErrorResponse) => {
        this.cargandoResumen = false;
        this.notificar(this.manejarError(err), 'error');
      }
    });
  }

  // 2. CONSULTAR CONDUCTORES
  consultarConductores(): void {
    if (!this.tieneAcceso) return;

    this.cargandoConductores = true;

    this.http.get<any>(
      '/api/admin/drivers',
      this.opciones()
    ).subscribe({
      next: respuesta => {
        this.cargandoConductores = false;

        if (respuesta?.success === false) {
          this.notificar(
            'No se pudo obtener la lista de conductores.',
            'error'
          );
          return;
        }

        this.conductores =
          this.leerLista<Conductor>(respuesta, 'drivers');

        this.cd.markForCheck();
      },

      error: (err: HttpErrorResponse) => {
        this.cargandoConductores = false;
        this.notificar(this.manejarError(err), 'error');
      }
    });
  }

  get conductoresFiltrados(): Conductor[] {
    if (this.filtroConductores === 'todos') {
      return this.conductores;
    }

    return this.conductores.filter(
      c => c.approval_status === this.filtroConductores
    );
  }

  get conductoresPendientes(): Conductor[] {
    return this.conductores.filter(
      c => c.approval_status === 'pending'
    );
  }

  // 3. APROBAR, RECHAZAR O SUSPENDER
  cambiarAprobacion(
    conductor: Conductor,
    estado: EstadoAprobacion
  ): void {
    if (!this.tieneAcceso || this.procesandoConductor !== null) {
      return;
    }

    const nota = (this.notas[conductor.id] || '').trim();

    if (!nota) {
      this.notificar(
        'Escribe una observación administrativa antes de continuar.',
        'error'
      );
      return;
    }

    const acciones = {
      approved: 'aprobar',
      rejected: 'rechazar',
      suspended: 'suspender'
    };

    const confirmado = window.confirm(
      `¿Confirmas ${acciones[estado]} a ${conductor.user.name}?`
    );

    if (!confirmado) return;

    this.procesandoConductor = conductor.id;
    this.limpiarMensaje();

    this.http.patch<{
      success: boolean;
      message: string;
      driver: {
        id: number;
        approval_status: string;
      };
    }>(
      `/api/admin/drivers/${conductor.id}/approval`,
      {
        approval_status: estado,
        admin_notes: nota
      },
      this.opciones()
    ).subscribe({
      next: respuesta => {
        this.procesandoConductor = null;

        if (respuesta.success) {
          conductor.approval_status =
            respuesta.driver.approval_status;

          this.notas[conductor.id] = '';
          this.notificar(respuesta.message);

          this.cargarResumen();
          this.consultarConductores();
        } else {
          this.notificar(
            'El servidor no confirmó la actualización.',
            'error'
          );
        }

        this.cd.markForCheck();
      },

      error: (err: HttpErrorResponse) => {
        this.procesandoConductor = null;
        this.notificar(this.manejarError(err), 'error');
      }
    });
  }

  // 4. CONSULTAR TARIFAS
  consultarTarifas(): void {
    if (!this.tieneAcceso) return;

    this.cargandoTarifas = true;

    this.http.get<any>(
      '/api/admin/fares',
      this.opciones()
    ).subscribe({
      next: respuesta => {
        this.cargandoTarifas = false;

        if (respuesta?.success === false) {
          this.notificar(
            'No se pudieron consultar las tarifas.',
            'error'
          );
          return;
        }

        this.tarifas =
          this.leerLista<Tarifa>(respuesta, 'fares');

        this.cd.markForCheck();
      },

      error: (err: HttpErrorResponse) => {
        this.cargandoTarifas = false;
        this.notificar(this.manejarError(err), 'error');
      }
    });
  }

  // 5. CREAR TARIFA
  crearTarifa(): void {
    if (!this.tieneAcceso || this.guardandoTarifa) {
      return;
    }

    const datos = { ...this.nuevaTarifa };

    if (!datos.name.trim()) {
      this.notificar(
        'Escribe el nombre de la tarifa.',
        'error'
      );
      return;
    }

    const valores = [
      datos.base_fare,
      datos.price_per_km,
      datos.price_per_minute,
      datos.minimum_fare,
      datos.surge_multiplier
    ];

    if (
      valores.some(v => !Number.isFinite(v)) ||
      datos.base_fare < 0 ||
      datos.price_per_km < 0 ||
      datos.price_per_minute < 0 ||
      datos.minimum_fare < 0 ||
      datos.surge_multiplier <= 0
    ) {
      this.notificar(
        'Revisa los valores numéricos de la tarifa.',
        'error'
      );
      return;
    }

    const confirmado = window.confirm(
      datos.active
        ? 'Esta tarifa se creará ACTIVA y podría afectar los precios de los viajes. ¿Continuar?'
        : '¿Deseas registrar esta nueva tarifa?'
    );

    if (!confirmado) return;

    this.guardandoTarifa = true;

    this.http.post<{
      success: boolean;
      message: string;
    }>(
      '/api/admin/fares',
      datos,
      this.opciones()
    ).subscribe({
      next: respuesta => {
        this.guardandoTarifa = false;

        if (respuesta.success) {
          this.notificar(respuesta.message);

          this.nuevaTarifa = {
            name: '',
            base_fare: 3800,
            price_per_km: 1250,
            price_per_minute: 250,
            minimum_fare: 6500,
            surge_multiplier: 1,
            active: false
          };

          this.consultarTarifas();
        } else {
          this.notificar(
            'No se pudo crear la tarifa.',
            'error'
          );
        }

        this.cd.markForCheck();
      },

      error: (err: HttpErrorResponse) => {
        this.guardandoTarifa = false;
        this.notificar(this.manejarError(err), 'error');
      }
    });
  }

  // 6. HISTORIAL DE VIAJES
  consultarViajes(): void {
    if (!this.tieneAcceso) return;

    this.cargandoViajes = true;

    let params = new HttpParams();

    if (this.filtroViajes !== 'todos') {
      params = params.set('status', this.filtroViajes);
    }

    this.http.get<any>(
      '/api/admin/trips',
      {
        ...this.opciones(),
        params
      }
    ).subscribe({
      next: respuesta => {
        this.cargandoViajes = false;

        if (respuesta?.success === false) {
          this.notificar(
            'No se pudieron consultar los viajes.',
            'error'
          );
          return;
        }

        this.viajes =
          this.leerLista<Viaje>(respuesta, 'trips');

        this.cd.markForCheck();
      },

      error: (err: HttpErrorResponse) => {
        this.cargandoViajes = false;
        this.notificar(this.manejarError(err), 'error');
      }
    });
  }

  // 7. REPORTES
  consultarReportes(): void {
    if (!this.tieneAcceso) return;

    this.cargandoReportes = true;
    this.reporte = null;

    this.http.get<unknown>(
      '/api/admin/reports',
      this.opciones()
    ).subscribe({
      next: respuesta => {
        this.cargandoReportes = false;
        this.reporte = respuesta;
        this.cd.markForCheck();
      },

      error: (err: HttpErrorResponse) => {
        this.cargandoReportes = false;
        this.notificar(this.manejarError(err), 'error');
      }
    });
  }

  // 8. AUDITORÍA
  consultarAuditoria(): void {
    if (!this.tieneAcceso) return;

    this.cargandoAuditoria = true;
    this.auditoria = null;

    this.http.get<unknown>(
      '/api/admin/audit-logs',
      this.opciones()
    ).subscribe({
      next: respuesta => {
        this.cargandoAuditoria = false;
        this.auditoria = respuesta;
        this.cd.markForCheck();
      },

      error: (err: HttpErrorResponse) => {
        this.cargandoAuditoria = false;
        this.notificar(this.manejarError(err), 'error');
      }
    });
  }
}
