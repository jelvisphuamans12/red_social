import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Feed from "./pages/Feed";
import Admin from "./pages/Admin";
import { useAuthStore } from "./store/authStore";
import Profile from "./pages/Profile";
import Chat from "./pages/Chat";
import Notifications from "./pages/Notifications";
import { NotificationsProvider } from "./context/NotificationsContext";
import { CallProvider } from "./context/CallContext";
import Friends from "./pages/Friends";
import FloatingChat from "./components/FloatingChat";

function App() {
  const token = useAuthStore((state) => state.token);

  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <NotificationsProvider key={token ?? "guest"}>
        <CallProvider key={`call-${token ?? "guest"}`}>
          <Routes>
            <Route
              path="/friends"
              element={token ? <Friends /> : <Navigate to="/login" />}
            />
            <Route
              path="/login"
              element={token ? <Navigate to="/" /> : <Login />}
            />
            <Route
              path="/register"
              element={token ? <Navigate to="/" /> : <Register />}
            />
            <Route
              path="/forgot-password"
              element={token ? <Navigate to="/" /> : <ForgotPassword />}
            />
            <Route
              path="/reset-password"
              element={token ? <Navigate to="/" /> : <ResetPassword />}
            />
            <Route
              path="/"
              element={token ? <Feed /> : <Navigate to="/login" />}
            />
            <Route
              path="/admin"
              element={token ? <Admin /> : <Navigate to="/login" />}
            />
            <Route
              path="/profile"
              element={token ? <Profile /> : <Navigate to="/login" />}
            />
            <Route
              path="/chat"
              element={token ? <Chat /> : <Navigate to="/login" />}
            />
            <Route
              path="/notifications"
              element={token ? <Notifications /> : <Navigate to="/login" />}
            />
          </Routes>

          {/* Ventana flotante de mensajes y llamadas estilo Facebook */}
          <FloatingChat />
        </CallProvider>
      </NotificationsProvider>
    </BrowserRouter>
  );
}

export default App;
