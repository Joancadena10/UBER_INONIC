import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { IonContent, IonButton, IonInput } from '@ionic/angular';

interface LoginResponse {
  success: boolean;
  access_token: string;
  user: {
    name: string;
    role: 'admin' | 'client' | 'driver';
  };
}

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink, IonContent, IonButton, IonInput],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login {

  private http = inject(HttpClient);
  private router = inject(Router);

  usuario = '';
  password = '';

  mostrarClave = signal(false);
  cargando = signal(false);
  error = signal('');

  iniciarSesion() {
    if (!this.usuario.trim() || !this.password) {
      this.error.set('Completa todos los campos.');
      return;
    }

    this.cargando.set(true);
    this.error.set('');

    this.http.post<LoginResponse>(
      '/api/auth/login',
      {
        login: this.usuario.trim(),
        password: this.password
      },
      {
        headers: {
          Accept: 'application/json'
        },
        timeout: 12000
      }
    ).subscribe({
      next: (respuesta) => {
        this.cargando.set(false);

        const rutas: Record<string, string> = {
          admin: '/administrador',
          client: '/cliente',
          driver: '/conductor'
        };

        const rol = respuesta.user?.role;
        const destino = rutas[rol];

        if (!respuesta.success ||
            !respuesta.access_token ||
            !destino) {
          this.error.set('Respuesta inválida del servidor.');
          return;
        }

        sessionStorage.setItem(
          'uber_token',
          respuesta.access_token
        );

        sessionStorage.setItem('uber_rol', rol);

        sessionStorage.setItem(
          'uber_nombre',
          respuesta.user.name
        );

        this.router.navigateByUrl(destino);
      },

      error: (err: HttpErrorResponse) => {
        this.cargando.set(false);

        if (err.status === 401) {
          this.error.set('Correo o contraseña incorrectos.');
        } else if (err.status === 422) {
          this.error.set('Revisa los datos ingresados.');
        } else if (err.status === 500) {
          this.error.set(
            'El servidor del profesor presenta un error interno.'
          );
        } else if (err.status === 0) {
          this.error.set(
            'No se pudo obtener respuesta del servidor.'
          );
        } else {
          this.error.set(
            `No se pudo iniciar sesión. Error ${err.status}.`
          );
        }
      }
    });
  }
}