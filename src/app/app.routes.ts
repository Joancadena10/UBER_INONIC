import { Routes } from '@angular/router';

import { Login } from './pages/login/login';
import { Cliente } from './pages/cliente/cliente';
import { Conductor } from './pages/conductor/conductor';
import { Administrador } from './pages/administrador/administrador';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },
  {
    path: 'login',
    component: Login
  },
  {
    path: 'cliente',
    component: Cliente
  },
  {
    path: 'conductor',
    component: Conductor
  },
  {
    path: 'administrador',
    component: Administrador
  },
  {
    path: '**',
    redirectTo: 'login'
  }
];