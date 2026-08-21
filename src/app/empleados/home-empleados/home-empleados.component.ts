import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { UsuariosService } from '../../service/usuarios.service';
import { MotosService } from '../../service/motos.service';
import { PagosService, PagoManual } from '../../service/pagos.service';
import { Usuario } from '../../shared/interfaces/usuario';
import { Moto } from '../../shared/interfaces/moto';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-home-empleados',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './home-empleados.component.html',
  styleUrl: './home-empleados.component.css',
})
export class HomeEmpleadosComponent implements OnInit {
  usuarioReal: Usuario | null = null;
  motosList: Moto[] = [];
  pagosPendientes: PagoManual[] = [];

  empleado = {
    nombre: 'Cargando...',
    rol: 'Conductor',
    cedula: '000000000',
    correo: '',
    telefono: '',
    fechaIngreso: 'Reciente',
    motosAsignadas: 0,
    estado: 'Cargando...',
    foto: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
    rendimiento: 100,
    viajesCompletados: 0,
  };

  stats = [
    { title: 'Motos Asignadas', value: '0', icon: '🛵', color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { title: 'Deuda Pendiente', value: '$0', icon: '💳', color: 'text-red-500', bg: 'bg-red-500/10' },
    { title: 'Rendimiento', value: '100%', icon: '📈', color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { title: 'Estado', value: 'Cargando...', icon: '👤', color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  ];

  actividadesRecientes: any[] = [];

  modalPagoVisible = false;
  pagoForm = {
    monto: 0,
    metodoPago: 'Transferencia',
    comprobanteImagen: null as string | null,
  };

  constructor(
    private router: Router,
    private usuariosService: UsuariosService,
    private motosService: MotosService,
    private pagosService: PagosService,
  ) {}

  ngOnInit() {
    if (typeof window !== 'undefined' && window.localStorage) {
      const storedName = localStorage.getItem('userName');
      if (storedName) this.empleado.nombre = storedName;
      const userId = localStorage.getItem('userId');
      if (userId) this.fetchRealData(userId);
    }
  }

  fetchRealData(userId: string) {
    this.usuariosService.getUsuario(userId).subscribe({
      next: (user) => {
        this.usuarioReal = user;
        this.empleado.nombre = `${user.nombre} ${user.apellido}`;
        this.empleado.cedula = String(user.cedula);
        this.empleado.telefono = user.telefono;
        this.empleado.correo = user.email;
        this.empleado.rol = user.rol;
        this.empleado.estado = user.activo ? 'Activo' : 'Inactivo';
        this.stats[3].value = this.empleado.estado;
      },
      error: (e) => console.error(e),
    });

    this.motosService.getMotosByConductor(userId).subscribe({
      next: (motos) => {
        this.motosList = motos;
        this.empleado.motosAsignadas = motos.length;
        this.stats[0].value = String(motos.length);
        this.actividadesRecientes = motos.map((m, i) => ({
          id: i,
          tipo: 'Asignación',
          descripcion: `Moto: ${m.marca} ${m.modelo} (${m.placa})`,
          fecha: 'Reciente',
          estado: 'En Uso',
        }));
      },
      error: (e) => console.error(e),
    });

    this.pagosService.getPagosByConductor(userId).subscribe({
      next: (pagos) => {
        this.pagosPendientes = pagos.filter((p) => !p.pagado);
        const deuda = this.pagosPendientes.reduce((s, p) => s + p.valorPagado, 0);
        this.stats[1].value = `$${deuda.toLocaleString()}`;
      },
      error: (e) => console.error(e),
    });
  }

  abrirModalPago() {
    this.pagoForm = { monto: 0, metodoPago: 'Transferencia', comprobanteImagen: null };
    this.modalPagoVisible = true;
  }

  cerrarModalPago() {
    this.modalPagoVisible = false;
  }

  onComprobanteSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.pagoForm.comprobanteImagen = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  enviarPago() {
    if (!this.pagoForm.monto || this.pagoForm.monto <= 0) {
      Swal.fire('Error', 'Ingrese un monto válido', 'error');
      return;
    }
    if (!this.pagoForm.comprobanteImagen) {
      Swal.fire('Error', 'Debe subir un comprobante de pago', 'warning');
      return;
    }
    if (!this.usuarioReal?._id) return;

    const d = new Date();
    const week = this.getWeek(d);
    const sem = `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;

    this.pagosService
      .createPago({
        conductorId: this.usuarioReal._id,
        semana: sem,
        monto: this.pagoForm.monto,
        pagado: false,
        metodoPago: this.pagoForm.metodoPago,
        comprobanteImagen: this.pagoForm.comprobanteImagen || undefined,
        observaciones: 'Pago reportado por conductor (Supabase)',
      })
      .subscribe({
        next: () => {
          Swal.fire('Éxito', 'Comprobante registrado en pagos.', 'success');
          this.modalPagoVisible = false;
          this.fetchRealData(this.usuarioReal!._id!);
        },
        error: (e) => {
          Swal.fire('Error', e?.message || e.error?.message || 'No se pudo enviar', 'error');
        },
      });
  }

  getWeek(d: Date) {
    const date: any = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart: any = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  }

  toggleEstado() {
    this.empleado.estado = this.empleado.estado === 'Activo' ? 'En descanso' : 'Activo';
    this.stats[3].value = this.empleado.estado;
  }

  goHome() {
    this.router.navigate(['']);
  }
}
