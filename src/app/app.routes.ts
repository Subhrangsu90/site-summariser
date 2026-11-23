import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'Site Summariser',
    loadComponent: () => import('./features/summariser/summariser').then((m) => m.Summariser),
  },
  { path: '**', redirectTo: '' },
];
