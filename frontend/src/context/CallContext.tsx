import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import type { ReactNode } from "react";
import { io, Socket } from "socket.io-client";
import toast from "react-hot-toast";
import { useAuthStore } from "../store/authStore";
import { SOCKET_URL } from "../lib/socketUrl";

export type CallType = "audio" | "video";

interface PeerInfo {
  id: number;
  name: string;
  avatarUrl: string | null;
}

interface IncomingCallData {
  fromUserId: number;
  callerName: string;
  callerAvatar: string | null;
  offer: RTCSessionDescriptionInit;
  callType: CallType;
}

interface CallContextValue {
  startCall: (targetUser: PeerInfo, callType: CallType) => Promise<void>;
  isBusy: boolean;
}

const CallContext = createContext<CallContextValue>({
  startCall: async () => {},
  isBusy: false,
});

export const useCall = () => useContext(CallContext);

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

function getAvatarUrl(url: string | null) {
  if (!url) return null;
  return url.startsWith("http") ? url : `${SOCKET_URL}${url}`;
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuthStore();

  const [callStatus, setCallStatus] = useState<
    "idle" | "calling" | "ringing" | "connected"
  >("idle");
  const [callType, setCallType] = useState<CallType>("video");
  const [remotePeer, setRemotePeer] = useState<PeerInfo | null>(null);
  const [incomingOffer, setIncomingOffer] =
    useState<RTCSessionDescriptionInit | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const callStatusRef = useRef(callStatus);
  callStatusRef.current = callStatus;

  const remotePeerRef = useRef(remotePeer);
  remotePeerRef.current = remotePeer;

  // Limpiar recursos de audio/video y conexión WebRTC
  const cleanupCall = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    remoteStreamRef.current = null;
    pendingCandidatesRef.current = [];

    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;

    setCallStatus("idle");
    setRemotePeer(null);
    setIncomingOffer(null);
    setIsMuted(false);
    setIsCameraOff(false);
    setCallSeconds(0);
  }, []);

  // Vincular streams a los elementos <video> / <audio> cuando cambie la UI
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
    if (remoteAudioRef.current && remoteStreamRef.current) {
      remoteAudioRef.current.srcObject = remoteStreamRef.current;
    }
  }, [callStatus, callType]);

  // Temporizador de llamada activa
  useEffect(() => {
    if (callStatus !== "connected") return;

    const timer = setInterval(() => {
      setCallSeconds((s) => s + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [callStatus]);

  // Crear RTCPeerConnection
  const createPeerConnection = useCallback(
    (targetUserId: number) => {
      const pc = new RTCPeerConnection(ICE_SERVERS);

      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit("call:ice-candidate", {
            toUserId: targetUserId,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (stream) {
          remoteStreamRef.current = stream;
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = stream;
          }
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = stream;
          }
        }
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "disconnected" ||
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          cleanupCall();
        }
      };

      pcRef.current = pc;
      return pc;
    },
    [cleanupCall],
  );

  // Obtener acceso a micrófono / cámara (con respaldo si la PC no tiene hardware)
  const getUserMediaStream = async (type: CallType) => {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === "video",
      });
    } catch (error: any) {
      console.warn(
        "Hardware de audio/video no disponible, usando canal de prueba:",
        error,
      );

      // Si no hay cámara pero sí micrófono en videollamada, intentar solo audio
      if (type === "video") {
        try {
          const audioOnly = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
          toast("Cámara no detectada, continuando solo con audio", {
            icon: "🎙️",
          });
          return audioOnly;
        } catch {
          // Continuar al stream silencioso
        }
      }

      // Crear pista de audio silenciosa para permitir probar la llamada sin micrófono físico
      const AudioCtx =
        window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const destination = ctx.createMediaStreamDestination();
      toast("Sin micrófono detectado: modo prueba activado", { icon: "🔇" });
      return destination.stream;
    }
  };

  // Conexión Socket.IO global para señalización de llamadas
  useEffect(() => {
    if (!token || !user) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    // Llamada entrante
    socket.on("call:incoming", (data: IncomingCallData) => {
      if (callStatusRef.current !== "idle") {
        socket.emit("call:reject", {
          toUserId: data.fromUserId,
          reason: "El usuario está ocupado en otra llamada",
        });
        return;
      }

      setRemotePeer({
        id: data.fromUserId,
        name: data.callerName,
        avatarUrl: data.callerAvatar,
      });
      setCallType(data.callType);
      setIncomingOffer(data.offer);
      setCallStatus("ringing");
    });

    // El destinatario aceptó la llamada
    socket.on(
      "call:accepted",
      async (data: {
        fromUserId: number;
        answer: RTCSessionDescriptionInit;
      }) => {
        if (!pcRef.current) return;

        try {
          await pcRef.current.setRemoteDescription(
            new RTCSessionDescription(data.answer),
          );

          for (const candidate of pendingCandidatesRef.current) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          }
          pendingCandidatesRef.current = [];

          setCallStatus("connected");
        } catch (err) {
          console.error("Error al procesar respuesta SDP:", err);
          cleanupCall();
        }
      },
    );

    // Candidatos ICE recibidos
    socket.on(
      "call:ice-candidate",
      async (data: { fromUserId: number; candidate: RTCIceCandidateInit }) => {
        if (!pcRef.current || !pcRef.current.remoteDescription) {
          pendingCandidatesRef.current.push(data.candidate);
          return;
        }

        try {
          await pcRef.current.addIceCandidate(
            new RTCIceCandidate(data.candidate),
          );
        } catch (err) {
          console.error("Error al agregar ICE candidate:", err);
        }
      },
    );

    // Llamada rechazada
    socket.on("call:rejected", (data: { reason?: string }) => {
      toast.error(data.reason || "Llamada rechazada");
      cleanupCall();
    });

    // Usuario no conectado
    socket.on("call:unavailable", (data: { reason?: string }) => {
      toast.error(data.reason || "Usuario no disponible");
      cleanupCall();
    });

    // La otra persona colgó
    socket.on("call:ended", () => {
      toast("Llamada finalizada", { icon: "📵" });
      cleanupCall();
    });

    return () => {
      cleanupCall();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, user, cleanupCall]);

  // Iniciar una llamada saliente
  const startCall = async (targetUser: PeerInfo, type: CallType) => {
    if (!socketRef.current || !user) {
      toast.error("Sin conexión al servidor de llamadas");
      return;
    }

    if (callStatusRef.current !== "idle") {
      toast.error("Ya tienes una llamada en curso");
      return;
    }

    try {
      const stream = await getUserMediaStream(type);
      localStreamRef.current = stream;

      setRemotePeer(targetUser);
      setCallType(type);
      setCallStatus("calling");

      const pc = createPeerConnection(targetUser.id);

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socketRef.current.emit("call:initiate", {
        toUserId: targetUser.id,
        offer,
        callType: type,
        callerName: user.name,
        callerAvatar: user.avatarUrl || null,
      });
    } catch {
      cleanupCall();
    }
  };

  // Aceptar llamada entrante
  const acceptIncomingCall = async () => {
    if (!socketRef.current || !remotePeer || !incomingOffer) return;

    try {
      const stream = await getUserMediaStream(callType);
      localStreamRef.current = stream;

      const pc = createPeerConnection(remotePeer.id);

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));

      for (const candidate of pendingCandidatesRef.current) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      pendingCandidatesRef.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socketRef.current.emit("call:accept", {
        toUserId: remotePeer.id,
        answer,
      });

      setCallStatus("connected");
    } catch {
      socketRef.current.emit("call:reject", {
        toUserId: remotePeer.id,
        reason: "No se pudo iniciar cámara/micrófono",
      });
      cleanupCall();
    }
  };

  // Rechazar llamada entrante
  const rejectIncomingCall = () => {
    if (socketRef.current && remotePeer) {
      socketRef.current.emit("call:reject", {
        toUserId: remotePeer.id,
        reason: "Llamada rechazada",
      });
    }
    cleanupCall();
  };

  // Colgar llamada activa o saliente
  const hangUpCall = () => {
    if (socketRef.current && remotePeerRef.current) {
      socketRef.current.emit("call:hangup", {
        toUserId: remotePeerRef.current.id,
      });
    }
    cleanupCall();
  };

  // Silenciar / activar micrófono
  const toggleMute = () => {
    if (!localStreamRef.current) return;
    const audioTracks = localStreamRef.current.getAudioTracks();
    const nextMuted = !isMuted;
    audioTracks.forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  };

  // Encender / apagar cámara
  const toggleCamera = () => {
    if (!localStreamRef.current) return;
    const videoTracks = localStreamRef.current.getVideoTracks();
    const nextOff = !isCameraOff;
    videoTracks.forEach((track) => {
      track.enabled = !nextOff;
    });
    setIsCameraOff(nextOff);
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, "0");
    const secs = (totalSeconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  };

  return (
    <CallContext.Provider
      value={{
        startCall,
        isBusy: callStatus !== "idle",
      }}
    >
      {children}

      {/* Audio remoto oculto para llamadas de solo voz */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* ==========================================
          MODAL DE LLAMADA ENTRANTE (GLOBAL)
          ========================================== */}
      {callStatus === "ringing" && remotePeer && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#192734] border border-[#38444d] rounded-3xl p-6 text-center text-white shadow-2xl">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full overflow-hidden bg-sky-600 flex items-center justify-center text-3xl font-bold ring-4 ring-sky-500/40 animate-pulse">
              {remotePeer.avatarUrl ? (
                <img
                  src={getAvatarUrl(remotePeer.avatarUrl)!}
                  alt={remotePeer.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                remotePeer.name.charAt(0).toUpperCase()
              )}
            </div>

            <h3 className="text-xl font-bold">{remotePeer.name}</h3>
            <p className="text-sm text-sky-400 mt-1">
              {callType === "video"
                ? "📹 Videollamada entrante..."
                : "📞 Llamada de voz entrante..."}
            </p>

            <div className="flex items-center justify-center gap-6 mt-7">
              <button
                type="button"
                onClick={rejectIncomingCall}
                className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center text-2xl shadow-lg transition"
                title="Rechazar"
              >
                📵
              </button>

              <button
                type="button"
                onClick={acceptIncomingCall}
                className="w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center text-2xl shadow-lg transition"
                title="Contestar"
              >
                {callType === "video" ? "📹" : "📞"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          PANTALLA DE LLAMADA SALIENTE O EN CURSO
          ========================================== */}
      {(callStatus === "calling" || callStatus === "connected") &&
        remotePeer && (
          <div className="fixed inset-0 z-50 bg-[#0f171e]/95 backdrop-blur flex flex-col items-center justify-between p-6 text-white">
            {/* CABECERA */}
            <div className="text-center z-10 mt-2">
              <h3 className="text-xl font-bold">{remotePeer.name}</h3>
              <p className="text-sm text-sky-400 mt-0.5">
                {callStatus === "calling"
                  ? "Llamando..."
                  : `${
                      callType === "video" ? "Videollamada" : "Llamada de voz"
                    } · ${formatTimer(callSeconds)}`}
              </p>
            </div>

            {/* ÁREA CENTRAL: VIDEO REMOTO O AVATAR EN LLAMADA DE VOZ */}
            <div className="relative w-full max-w-4xl flex-1 my-4 rounded-3xl overflow-hidden bg-[#192734] border border-[#38444d] flex items-center justify-center">
              {callType === "video" ? (
                <>
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />

                  {/* VISTA PREVIA DE MI CÁMARA (PIP) */}
                  <div className="absolute bottom-4 right-4 w-32 sm:w-44 aspect-video rounded-2xl overflow-hidden border-2 border-sky-500 bg-black shadow-xl">
                    <video
                      ref={localVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className={`w-full h-full object-cover scale-x-[-1] ${
                        isCameraOff ? "hidden" : ""
                      }`}
                    />
                    {isCameraOff && (
                      <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                        Cámara apagada
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="w-28 h-28 rounded-full overflow-hidden bg-sky-600 flex items-center justify-center text-4xl font-bold ring-4 ring-sky-500/30 mb-4">
                    {remotePeer.avatarUrl ? (
                      <img
                        src={getAvatarUrl(remotePeer.avatarUrl)!}
                        alt={remotePeer.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      remotePeer.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <p className="text-gray-300 text-sm">
                    {callStatus === "calling"
                      ? "Esperando respuesta..."
                      : "Audio conectado"}
                  </p>
                </div>
              )}
            </div>

            {/* CONTROLES INFERIORES */}
            <div className="flex items-center gap-4 z-10 mb-2">
              <button
                type="button"
                onClick={toggleMute}
                className={`w-13 h-13 rounded-full flex items-center justify-center text-xl transition ${
                  isMuted
                    ? "bg-amber-500 text-black"
                    : "bg-[#253341] hover:bg-[#304253] text-white"
                }`}
                title={isMuted ? "Activar micrófono" : "Silenciar micrófono"}
              >
                {isMuted ? "🔇" : "🎙️"}
              </button>

              {callType === "video" && (
                <button
                  type="button"
                  onClick={toggleCamera}
                  className={`w-13 h-13 rounded-full flex items-center justify-center text-xl transition ${
                    isCameraOff
                      ? "bg-amber-500 text-black"
                      : "bg-[#253341] hover:bg-[#304253] text-white"
                  }`}
                  title={isCameraOff ? "Encender cámara" : "Apagar cámara"}
                >
                  {isCameraOff ? "🚫" : "📹"}
                </button>
              )}

              <button
                type="button"
                onClick={hangUpCall}
                className="px-6 h-13 rounded-full bg-red-600 hover:bg-red-700 text-white font-bold flex items-center gap-2 shadow-lg transition"
                title="Colgar"
              >
                <span>📵</span>
                <span>Colgar</span>
              </button>
            </div>
          </div>
        )}
    </CallContext.Provider>
  );
}
