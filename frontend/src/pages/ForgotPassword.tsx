import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

type Method = "email" | "security";

export default function ForgotPassword() {
  const [method, setMethod] = useState<Method>("email");
  const [email, setEmail] = useState("");

  // Estado para pregunta de seguridad
  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [step, setStep] = useState<"request" | "answer" | "reset">("request");
  const [resetToken, setResetToken] = useState<string | null>(null);

  // Estado para cambiar contraseña ahí mismo
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function resetFeedback() {
    setMessage(null);
    setError(null);
  }

  function handleSwitchMethod(nextMethod: Method) {
    setMethod(nextMethod);
    setStep("request");
    setQuestion(null);
    setAnswer("");
    setResetToken(null);
    setNewPassword("");
    setConfirmPassword("");
    resetFeedback();
  }

  // 1A. Enviar enlace por correo (sin exigir que el correo esté registrado en el frontend)
  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    resetFeedback();
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo procesar la solicitud.");
      } else {
        setMessage(
          data.message ||
            "Solicitud procesada. Si el correo está registrado, se enviará el enlace.",
        );
      }
    } catch {
      setError("Error de conexión con el servidor.");
    } finally {
      setLoading(false);
    }
  }

  // 1B. Obtener pregunta de seguridad para el correo ingresado
  async function handleFetchQuestion(e: FormEvent) {
    e.preventDefault();
    resetFeedback();
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/security-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo obtener la pregunta de seguridad.");
      } else {
        setQuestion(
          data.question || "¿Cuál es tu palabra o dato de seguridad?",
        );
        setStep("answer");
      }
    } catch {
      setError("Error de conexión con el servidor.");
    } finally {
      setLoading(false);
    }
  }

  // 2. Validar respuesta de seguridad y habilitar cambio de contraseña ahí mismo
  async function handleVerifyAnswer(e: FormEvent) {
    e.preventDefault();
    resetFeedback();
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/verify-security-answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, answer }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "La respuesta no coincide.");
      } else {
        setResetToken(data.resetToken || data.token || "direct-reset");
        setStep("reset");
        setMessage("Validación correcta. Escribe tu nueva contraseña.");
      }
    } catch {
      setError("Error de conexión con el servidor.");
    } finally {
      setLoading(false);
    }
  }

  // 3. Guardar nueva contraseña directamente en esta misma página
  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    resetFeedback();

    if (newPassword.length < 6) {
      setError("La nueva contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          token: resetToken,
          password: newPassword,
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo actualizar la contraseña.");
      } else {
        setMessage(
          data.message ||
            "Contraseña actualizada correctamente. Ya puedes iniciar sesión.",
        );
        setStep("request");
        setAnswer("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setError("Error de conexión con el servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 20 }}>
      <h2>Recuperar cuenta</h2>
      <p>
        Elige cómo quieres validar: enviando un enlace al correo o respondiendo
        una pregunta de seguridad.
      </p>

      {/* Selector de método */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => handleSwitchMethod("email")}
          style={{
            padding: "8px 12px",
            fontWeight: method === "email" ? "bold" : "normal",
          }}
        >
          Enviar correo
        </button>
        <button
          type="button"
          onClick={() => handleSwitchMethod("security")}
          style={{
            padding: "8px 12px",
            fontWeight: method === "security" ? "bold" : "normal",
          }}
        >
          Pregunta de seguridad
        </button>
      </div>

      {/* Flujo 1: Por correo */}
      {method === "email" && (
        <form onSubmit={handleEmailSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ padding: "8px 16px" }}
          >
            {loading ? "Enviando..." : "Enviar enlace"}
          </button>
        </form>
      )}

      {/* Flujo 2: Por pregunta de seguridad + cambio de contraseña ahí mismo */}
      {method === "security" && step === "request" && (
        <form onSubmit={handleFetchQuestion}>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="sec-email">Correo electrónico</label>
            <input
              id="sec-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ padding: "8px 16px" }}
          >
            {loading ? "Buscando..." : "Continuar"}
          </button>
        </form>
      )}

      {method === "security" && step === "answer" && (
        <form onSubmit={handleVerifyAnswer}>
          <div style={{ marginBottom: 12 }}>
            <p style={{ marginBottom: 6 }}>
              <strong>Pregunta:</strong> {question}
            </p>
            <label htmlFor="answer">Tu respuesta</label>
            <input
              id="answer"
              type="text"
              required
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Escribe tu respuesta"
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ padding: "8px 16px" }}
          >
            {loading ? "Validando..." : "Validar respuesta"}
          </button>
        </form>
      )}

      {method === "security" && step === "reset" && (
        <form onSubmit={handleChangePassword}>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="new-password">Nueva contraseña</label>
            <input
              id="new-password"
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label htmlFor="confirm-password">Confirmar nueva contraseña</label>
            <input
              id="confirm-password"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repite la nueva contraseña"
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ padding: "8px 16px" }}
          >
            {loading ? "Guardando..." : "Cambiar contraseña"}
          </button>
        </form>
      )}

      {message && <p style={{ color: "green", marginTop: 12 }}>{message}</p>}
      {error && <p style={{ color: "crimson", marginTop: 12 }}>{error}</p>}

      <div style={{ marginTop: 16 }}>
        <Link to="/login">Volver a iniciar sesión</Link>
      </div>
    </div>
  );
}
