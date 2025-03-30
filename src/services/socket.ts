import { io, Socket } from 'socket.io-client';
import { GrpcServiceInfo, GrpcConnection, LogEntry, StatsData } from '../types/api';

// Event handler types for better type safety
type SocketEventHandlers = {
  log: (log: LogEntry) => void;
  services: (services: GrpcServiceInfo[]) => void;
  connections: (connections: GrpcConnection[]) => void;
  connection: (connection: GrpcConnection) => void;
  stats: (stats: StatsData) => void;
  connect: () => void;
  disconnect: () => void;
  connect_error: (error: Error) => void;
};

// Socket request options
interface GetLogsOptions {
  levels?: string[];
  service?: string;
  limit?: number;
}

/**
 * Enhanced Socket.IO service for real-time communication with the gRPC Dashboard backend
 */
class SocketService {
  private socket: Socket | null = null;
  private handlers: Partial<Record<keyof SocketEventHandlers, Function[]>> = {};
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectionDelay: number = 1000;
  private url: string = '';
  private namespace: string = '/grpc-dashboard';
  private autoReconnect: boolean = true;

  /**
   * Connect to the WebSocket server
   *
   * @param url - Server URL (defaults to window.location.origin)
   * @returns Socket instance
   */
  connect(url: string = window.location.origin): Socket | null {
    // Store URL for reconnection
    this.url = url;

    if (this.socket) {
      this.disconnect();
    }

    try {
      // Create a new socket connection
      this.socket = io(`${url}${this.namespace}`, {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectionDelay,
        timeout: 10000,
      });

      // Set up listeners for built-in events
      this.socket.on('connect', () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.triggerHandlers('connect');
      });

      this.socket.on('disconnect', (reason) => {
        console.log(`WebSocket disconnected: ${reason}`);
        this.triggerHandlers('disconnect');

        // Handle reconnection if not explicitly closed
        if (this.autoReconnect && reason !== 'io client disconnect') {
          this.attemptReconnect();
        }
      });

      this.socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        this.triggerHandlers('connect_error', error);

        // Handle reconnection
        if (this.autoReconnect) {
          this.attemptReconnect();
        }
      });

      // Set up listeners for custom events
      this.socket.on('log', (log: LogEntry) => {
        this.triggerHandlers('log', log);
      });

      this.socket.on('services', (services: GrpcServiceInfo[]) => {
        this.triggerHandlers('services', services);
      });

      this.socket.on('connections', (connections: GrpcConnection[]) => {
        this.triggerHandlers('connections', connections);
      });

      this.socket.on('connection', (connection: GrpcConnection) => {
        this.triggerHandlers('connection', connection);
      });

      this.socket.on('stats', (stats: StatsData) => {
        this.triggerHandlers('stats', stats);
      });

      return this.socket;
    } catch (error) {
      console.error('Error creating socket connection:', error);
      return null;
    }
  }

  /**
   * Attempt to reconnect to the WebSocket server
   *
   * @private
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(
        `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`,
      );

      setTimeout(() => {
        this.connect(this.url);
      }, this.reconnectionDelay * this.reconnectAttempts);
    } else {
      console.error('Maximum reconnection attempts reached');
    }
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      // Prevent auto reconnect when explicitly disconnected
      this.autoReconnect = false;
      this.socket.disconnect();
      this.socket = null;
      this.reconnectAttempts = 0;
    }
  }

  /**
   * Register an event handler
   *
   * @param event - Event name
   * @param handler - Event handler function
   * @returns Function to remove the handler
   */
  on<K extends keyof SocketEventHandlers>(event: K, handler: SocketEventHandlers[K]): () => void {
    if (!this.handlers[event]) {
      this.handlers[event] = [];
    }
    this.handlers[event]!.push(handler);

    // Return a function to remove the handler
    return () => {
      this.off(event, handler);
    };
  }

  /**
   * Remove an event handler
   *
   * @param event - Event name
   * @param handler - Event handler function to remove
   */
  off<K extends keyof SocketEventHandlers>(event: K, handler: SocketEventHandlers[K]): void {
    if (this.handlers[event]) {
      this.handlers[event] = this.handlers[event]!.filter((h) => h !== handler);
    }
  }

  /**
   * Trigger all handlers for an event
   *
   * @private
   * @param event - Event name
   * @param args - Arguments to pass to handlers
   */
  private triggerHandlers(event: string, ...args: any[]): void {
    if (this.handlers[event as keyof SocketEventHandlers]) {
      this.handlers[event as keyof SocketEventHandlers]!.forEach((handler) => {
        try {
          handler(...args);
        } catch (error) {
          console.error(`Error in ${event} handler:`, error);
        }
      });
    }
  }

  /**
   * Request services from the server
   */
  getServices(): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('getServices');
    } else {
      console.warn('Cannot get services: Socket not connected');
    }
  }

  /**
   * Request connections from the server
   */
  getConnections(): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('getConnections');
    } else {
      console.warn('Cannot get connections: Socket not connected');
    }
  }

  /**
   * Request logs from the server
   *
   * @param options - Options for filtering logs
   */
  getLogs(options?: GetLogsOptions): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('getLogs', options);
    } else {
      console.warn('Cannot get logs: Socket not connected');
    }
  }

  /**
   * Request stats from the server
   */
  getStats(): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('getStats');
    } else {
      console.warn('Cannot get stats: Socket not connected');
    }
  }

  /**
   * Check if the socket is connected
   *
   * @returns True if connected, false otherwise
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  /**
   * Set auto reconnect option
   *
   * @param value - Whether to automatically reconnect
   */
  setAutoReconnect(value: boolean): void {
    this.autoReconnect = value;
  }

  /**
   * Configure reconnection settings
   *
   * @param options - Reconnection options
   */
  configureReconnection(options: { maxAttempts?: number; delay?: number }): void {
    if (options.maxAttempts !== undefined) {
      this.maxReconnectAttempts = options.maxAttempts;
    }

    if (options.delay !== undefined) {
      this.reconnectionDelay = options.delay;
    }
  }
}

// Create a singleton instance
const socketService = new SocketService();

export default socketService;
