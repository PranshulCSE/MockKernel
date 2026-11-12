import type { Server as HttpServer } from 'node:http';
import { isValidObjectId } from 'mongoose';
import { Server, type Socket } from 'socket.io';
import { getEnvConfig } from './env.js';
import { resolveUserFromToken, type AuthUser } from '../middleware/auth.js';

let ioInstance: Server | null = null;

export function getIO(): Server | null {
  return ioInstance;
}

/** Attaches Socket.io with JWT handshake authentication to an HTTP server. */
export function createSocketServer(httpServer: HttpServer): Server {
  const { clientUrl } = getEnvConfig();
  const io = new Server(httpServer, {
    cors: {
      origin: clientUrl,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const authToken =
        typeof socket.handshake.auth?.token === 'string'
          ? socket.handshake.auth.token
          : undefined;
      const headerAuth = socket.handshake.headers.authorization;
      const bearer =
        typeof headerAuth === 'string' &&
        headerAuth.toLowerCase().startsWith('bearer ')
          ? headerAuth.slice(7).trim()
          : undefined;

      const token = authToken || bearer;
      if (!token) {
        next(new Error('UNAUTHENTICATED'));
        return;
      }

      const user = await resolveUserFromToken(token);
      (socket.data as { user?: AuthUser }).user = user;
      next();
    } catch {
      next(new Error('UNAUTHENTICATED'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket.data as { user?: AuthUser }).user;
    if (user) {
      void socket.join(`user:${user.id}`);
    }

    socket.on('contest:join', (contestId: unknown) => {
      if (typeof contestId === 'string' && isValidObjectId(contestId)) {
        void socket.join(`contest:${contestId}`);
      }
    });

    socket.on('contest:leave', (contestId: unknown) => {
      if (typeof contestId === 'string' && isValidObjectId(contestId)) {
        void socket.leave(`contest:${contestId}`);
      }
    });

    socket.on('disconnect', () => {
      // Room memberships are cleaned up automatically by Socket.io
    });
  });

  ioInstance = io;
  console.log('[Server] Socket.io server attached');
  return io;
}
