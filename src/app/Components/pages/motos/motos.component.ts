import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Moto } from '../../../shared/interfaces/moto';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';


@Component({
  selector: 'app-motos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './motos.component.html',
  styleUrl: './motos.component.css'
})
export class MotosComponent {
  modalVisible: boolean = false;
motoEditada: any = { placa: '', modelo: '', anio: new Date().getFullYear() };
  formularioInvalido: boolean = false;
  motos: Moto[] = [
    {
      placa: 'ABC123',
      modelo: 'AKT NKD 125',
      anio: 2022,
      soat: '2025-02-10',
      tecnomecanica: '2024-11-30',
      estado: 'Activa'
    },
    {
      placa: 'XYZ987',
      modelo: 'Bajaj Pulsar 150',
      anio: 2021,
      soat: '2024-09-15',
      tecnomecanica: '2024-10-20',
      estado: 'En mantenimiento'
    }
  ];

  nuevaMoto: Moto = {
    placa: '',
    modelo: '',
    anio: new Date().getFullYear(),
    soat: '',
    tecnomecanica: '',
    estado: 'Activa'
  };

  agregarMoto() {
    // Validación del formulario
    if (!this.nuevaMoto.placa.trim() || !this.nuevaMoto.modelo.trim()) {
      this.formularioInvalido = true;
      Swal.fire({
        position: 'top-end',
        icon: 'error',
        title: '⚠️ Completa todos los campos requeridos',
        showConfirmButton: false,
        timer: 1500,
        toast: true,
        background: '#FF4136',
        color: 'white',
      });
      return;
    }

    this.formularioInvalido = false;
    this.motos.push({ ...this.nuevaMoto });

    // Mostrar Toast de éxito
    Swal.fire({
      position: 'top-end',
      icon: 'success',
      title: '✅ Moto agregada correctamente!',
      showConfirmButton: false,
      timer: 1500,
      toast: true,
      background: '#28A745',
      color: 'white',
    });

    // Reiniciar formulario
    this.nuevaMoto = {
      placa: '',
      modelo: '',
      anio: new Date().getFullYear(),
      soat: '',
      tecnomecanica: '',
      estado: 'Activa'
    };
  }
abrirModal(moto: any) {
  this.motoEditada = { ...moto };  // Copiar los datos de la moto seleccionada
  this.modalVisible = true;        // Mostrar el modal
}

cerrarModal() {
  this.modalVisible = false;       // Ocultar el modal
}

editarMoto() {
  const index = this.motos.findIndex(m => m.placa === this.motoEditada.placa);
  if (index !== -1) {
    this.motos[index] = { ...this.motoEditada };

    // Mostrar mensaje de éxito
    Swal.fire({
      position: 'top-end',
      icon: 'success',
      title: '✅ Moto editada correctamente!',
      showConfirmButton: false,
      timer: 1500,
      toast: true,
      background: '#28A745',
      color: 'white',
    });
  }
  this.cerrarModal();  // Cerrar el modal
}


}
