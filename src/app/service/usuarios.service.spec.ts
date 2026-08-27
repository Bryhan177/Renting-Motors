import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { UsuariosService } from './usuarios.service';
import { Usuario, CreateUsuarioPayload } from '../shared/interfaces/usuario';
import { AuthService } from '../auth/auth.service';

describe('UsuariosService', () => {
  let service: UsuariosService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        UsuariosService,
        { provide: AuthService, useValue: { getEmpresaId: () => null } },
      ]
    });
    service = TestBed.inject(UsuariosService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should get all usuarios', () => {
    const mockUsuarios: Usuario[] = [
      {
        _id: '1',
        nombre: 'Juan',
        apellido: 'Pérez',
        email: 'juan@test.com',
        cedula: 12345678,
        telefono: '123456789',
        rol: 'usuario',
        activo: true
      },
      {
        _id: '2',
        nombre: 'María',
        apellido: 'García',
        email: 'maria@test.com',
        cedula: 87654321,
        telefono: '987654321',
        rol: 'empleado',
        activo: true
      }
    ];

    service.getUsuarios().subscribe(usuarios => {
      expect(usuarios).toEqual(mockUsuarios);
    });

    const req = httpMock.expectOne('http://localhost:3000/usuarios');
    expect(req.request.method).toBe('GET');
    req.flush(mockUsuarios);
  });

  it('should get a single usuario by id', () => {
    const mockUsuario: Usuario = {
      _id: '1',
      nombre: 'Juan',
      apellido: 'Pérez',
      email: 'juan@test.com',
      cedula: 12345678,
      telefono: '123456789',
      rol: 'usuario',
      activo: true
    };

    service.getUsuario('1').subscribe(usuario => {
      expect(usuario).toEqual(mockUsuario);
    });

    const req = httpMock.expectOne('http://localhost:3000/usuarios/1');
    expect(req.request.method).toBe('GET');
    req.flush(mockUsuario);
  });

  it('should create a new usuario', () => {
    const newUsuario: CreateUsuarioPayload = {
      nombre: 'Carlos',
      apellido: 'López',
      email: 'carlos@test.com',
      cedula: 11223344,
      telefono: '555666777',
      rol: 'usuario',
      activo: true,
      password: 'password123'
    };
    const createdUsuario: Usuario = { _id: '3', ...newUsuario };

    service.createUsuario(newUsuario).subscribe(usuario => {
      expect(usuario).toEqual(createdUsuario);
    });

    const req = httpMock.expectOne('http://localhost:3000/usuarios');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(newUsuario);
    req.flush(createdUsuario);
  });

  it('should update a usuario', () => {
    const updateData: Partial<Usuario> = { activo: false };
    const updatedUsuario: Usuario = {
      _id: '1',
      nombre: 'Juan',
      apellido: 'Pérez',
      email: 'juan@test.com',
      cedula: 12345678,
      telefono: '123456789',
      rol: 'usuario',
      activo: false
    };

    service.updateUsuario('1', updateData).subscribe(usuario => {
      expect(usuario).toEqual(updatedUsuario);
    });

    const req = httpMock.expectOne('http://localhost:3000/usuarios/1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(updateData);
    req.flush(updatedUsuario);
  });

  it('should delete a usuario', () => {
    const deletedUsuario: Usuario = {
      _id: '1',
      nombre: 'Juan',
      apellido: 'Pérez',
      email: 'juan@test.com',
      cedula: 12345678,
      telefono: '123456789',
      rol: 'usuario',
      activo: true
    };

    service.deleteUsuario('1').subscribe(usuario => {
      expect(usuario).toEqual(deletedUsuario);
    });

    const req = httpMock.expectOne('http://localhost:3000/usuarios/1');
    expect(req.request.method).toBe('DELETE');
    req.flush(deletedUsuario);
  });
});

