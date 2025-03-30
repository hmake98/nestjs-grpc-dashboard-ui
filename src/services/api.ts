import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { notification } from 'antd';
import { GrpcServiceInfo, GrpcConnection, LogEntry, StatsData, SystemInfo } from '../types/api';

const API_PREFIX = '/grpc-dashboard/api';

// Request timeout (15 seconds)
const REQUEST_TIMEOUT = 15000;

/**
 * Enhanced API client with interceptors and error handling
 */
class ApiClient {
  private client: AxiosInstance;
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(baseURL: string) {
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: REQUEST_TIMEOUT,
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        // Create abort controller for this request
        const controller = new AbortController();
        const requestId = `${config.method}-${config.url}-${Date.now()}`;
        config.signal = controller.signal;
        this.abortControllers.set(requestId, controller);

        // Add request ID to request for tracking
        config.headers = {
          ...config.headers,
          'X-Request-ID': requestId,
        };

        return config;
      },
      (error) => {
        return Promise.reject(error);
      },
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        // Clean up abort controller
        const requestId = response.config.headers?.['X-Request-ID'] as string;
        if (requestId) {
          this.abortControllers.delete(requestId);
        }

        return response;
      },
      (error: AxiosError) => {
        // Clean up abort controller
        const requestId = error.config?.headers?.['X-Request-ID'] as string;
        if (requestId) {
          this.abortControllers.delete(requestId);
        }

        // Handle specific error types
        if (error.response) {
          // Server responded with non-2xx status
          const status = error.response.status;
          const data = error.response.data as any;

          if (status === 401 || status === 403) {
            notification.error({
              message: 'Authentication Error',
              description: 'You are not authorized to perform this action.',
            });
          } else if (status === 404) {
            notification.warning({
              message: 'Resource Not Found',
              description: 'The requested resource could not be found.',
            });
          } else if (status >= 500) {
            notification.error({
              message: 'Server Error',
              description: data.message || 'An unexpected server error occurred.',
            });
          }
        } else if (error.request) {
          // Request was made but no response received
          notification.error({
            message: 'Network Error',
            description: 'Unable to connect to the server. Please check your connection.',
          });
        } else {
          // Error in setting up the request
          notification.error({
            message: 'Request Error',
            description: error.message || 'An error occurred while making the request.',
          });
        }

        return Promise.reject(error);
      },
    );
  }

  /**
   * Abort all pending requests
   */
  public abortAllRequests(): void {
    this.abortControllers.forEach((controller) => {
      controller.abort();
    });
    this.abortControllers.clear();
  }

  /**
   * Make a GET request
   */
  public async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.client.get<T>(url, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Make a POST request
   */
  public async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.client.post<T>(url, data, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Make a PUT request
   */
  public async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.client.put<T>(url, data, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Make a DELETE request
   */
  public async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.client.delete<T>(url, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
}

// Create API client instance
const apiClient = new ApiClient(API_PREFIX);

/**
 * Service for making API requests to the gRPC Dashboard backend
 */
export const ApiService = {
  // Services
  async getServices(): Promise<GrpcServiceInfo[]> {
    return apiClient.get<GrpcServiceInfo[]>('/services');
  },

  async getServiceById(id: string): Promise<GrpcServiceInfo> {
    return apiClient.get<GrpcServiceInfo>(`/services/${id}`);
  },

  // Connections
  async getConnections(): Promise<GrpcConnection[]> {
    return apiClient.get<GrpcConnection[]>('/connections');
  },

  // Logs
  async getLogs(options?: {
    levels?: string[];
    service?: string;
    limit?: number;
  }): Promise<LogEntry[]> {
    const params = new URLSearchParams();

    if (options?.levels && options.levels.length > 0) {
      params.append('levels', options.levels.join(','));
    }

    if (options?.service) {
      params.append('service', options.service);
    }

    if (options?.limit) {
      params.append('limit', options.limit.toString());
    }

    return apiClient.get<LogEntry[]>('/logs', { params });
  },

  // Stats
  async getStats(): Promise<StatsData> {
    return apiClient.get<StatsData>('/stats');
  },

  // System Info
  async getSystemInfo(): Promise<SystemInfo> {
    return apiClient.get<SystemInfo>('/info');
  },

  // Utility to abort all pending requests (useful when unmounting components)
  abortAllRequests(): void {
    apiClient.abortAllRequests();
  },
};

export default ApiService;
