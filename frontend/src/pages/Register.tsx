import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/auth/register', { name, email, password, inviteCode });
      login(res.data.user, res.data.token);
      toast.success('¡Cuenta creada con éxito!');
      navigate('/');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Error al registrarse');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-md w-96">
        <h2 className="text-2xl font-bold text-center text-blue-600 mb-6">Registro con Invitación</h2>
        <input type="text" placeholder="Nombre completo" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-2 mb-4 border rounded" required />
        <input type="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-2 mb-4 border rounded" required />
        <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-2 mb-4 border rounded" required />
        <input type="text" placeholder="Código de invitación (ej. 6872ADF0)" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} className="w-full p-2 mb-4 border rounded uppercase" required />
        <button type="submit" className="w-full bg-green-600 text-white p-2 rounded hover:bg-green-700 transition">Crear Cuenta</button>
        <p className="text-sm text-center mt-4">¿Ya tienes cuenta? <Link to="/login" className="text-blue-500 hover:underline">Inicia sesión</Link></p>
      </form>
    </div>
  );
}