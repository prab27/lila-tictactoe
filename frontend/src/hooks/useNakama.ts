import { useRef, useState, useCallback } from 'react';
import { Client, Session, Socket } from '@heroiclabs/nakama-js';

const NAKAMA_HOST = process.env.REACT_APP_NAKAMA_HOST || 'localhost';
const NAKAMA_PORT = process.env.REACT_APP_NAKAMA_PORT || '7350';
const NAKAMA_USE_SSL = process.env.REACT_APP_NAKAMA_SSL === 'true';
const NAKAMA_SERVER_KEY = process.env.REACT_APP_NAKAMA_KEY || 'defaultkey';

export function useNakama() {
  const clientRef = useRef<Client | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const getClient = useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = new Client(
        NAKAMA_SERVER_KEY,
        NAKAMA_HOST,
        NAKAMA_PORT,
        NAKAMA_USE_SSL,
        7000,
        false
      );
    }
    return clientRef.current;
  }, []);

  const authenticate = useCallback(async (username: string): Promise<Session> => {
    const client = getClient();
    // Use device ID stored in localStorage for persistence
    let deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
      deviceId = 'device-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();
      localStorage.setItem('deviceId', deviceId);
    }

    const session = await client.authenticateDevice(deviceId, true, username);
    // Update display name
    await client.updateAccount(session, { displayName: username, username: username });
    sessionRef.current = session;
    return session;
  }, [getClient]);

  const connectSocket = useCallback(async (session: Session): Promise<Socket> => {
    const client = getClient();
    const socket = client.createSocket(NAKAMA_USE_SSL, false);

    socket.ondisconnect = () => setIsConnected(false);
    socket.onclose = () => setIsConnected(false);

    await socket.connect(session, true);
    socketRef.current = socket;
    setIsConnected(true);
    return socket;
  }, [getClient]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect(false);
      socketRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const rpc = useCallback(async (id: string, payload?: object): Promise<any> => {
    const client = getClient();
    const session = sessionRef.current;
    if (!session) throw new Error('Not authenticated');
    const result = await client.rpcGet(session, id, payload ? JSON.stringify(payload) : undefined);
    return result.payload ? JSON.parse(result.payload as string) : null;
  }, [getClient]);

  return {
    clientRef,
    sessionRef,
    socketRef,
    isConnected,
    authenticate,
    connectSocket,
    disconnect,
    rpc,
  };
}
