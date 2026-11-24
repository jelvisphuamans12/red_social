import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import toast from 'react-hot-toast';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  isBanned: boolean;
}

interface Invite {
  id: number;
  code: string;
  usedById: number | null;
  usedBy?: { name: string };
}

export default function Admin() {
  const [users, setUsers] = useState<User[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);

  const fetchData = async () => {
    try {
      const [usersRes, invitesRes] = await Promise.all([
        api.get('/admin/users'),
        api.get('/admin/invites')
      ]);
      setUsers(usersRes.data);
      setInvites(invitesRes.data);
    } catch (error) {
      toast.error('Error al cargar datos. ¿Eres Administrador?');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const createInvite = async () => {
    try {
      const res = await api.post('/admin/invites');
      toast.success('Invitación creada: ' + res.data.invite.code);
      fetchData(); // Recargar la lista
    } catch (error) {
      toast.error('Error al crear invitación');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800">Panel de Administrador</h1>
          <Link to="/" className="text-blue-600 hover:underline">Volver al Feed</Link>
        </div>

        {/* Sección de Invitaciones */}
        <div className="bg-white p-6 rounded-lg shadow-md mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-700">Códigos de Invitación</h2>
            <button onClick={createInvite} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
              + Generar Invitación
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {invites.map((inv) => (
              <div key={inv.id} className={`p-3 rounded border ${inv.usedById ? 'bg-gray-100 text-gray-500' : 'bg-green-50 border-green-200'}`}>
                <p className="font-mono font-bold text-lg">{inv.code}</p>
                <p className="text-xs mt-1">{inv.usedById ? `Usado por: ${inv.usedBy?.name}` : 'Disponible'}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Sección de Usuarios */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-bold text-gray-700 mb-4">Usuarios Registrados</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="p-3 text-sm font-semibold text-gray-600">Nombre</th>
                  <th className="p-3 text-sm font-semibold text-gray-600">Email</th>
                  <th className="p-3 text-sm font-semibold text-gray-600">Rol</th>
                  <th className="p-3 text-sm font-semibold text-gray-600">Estado</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b hover:bg-gray-50">
                    <td className="p-3">{user.name}</td>
                    <td className="p-3 text-gray-600">{user.email}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${user.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="p-3">
                      {user.isBanned ? <span className="text-red-600 font-bold">Baneado</span> : <span className="text-green-600">Activo</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}