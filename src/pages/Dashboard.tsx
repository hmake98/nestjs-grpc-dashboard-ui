import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Typography,
  Tag,
  Space,
  Button,
  Alert,
  Tooltip,
  Skeleton,
  Empty,
  Badge,
} from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ApiOutlined,
  DatabaseOutlined,
  ReloadOutlined,
  FieldTimeOutlined,
  LinkOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { GrpcServiceInfo, LogEntry, StatsData } from '../types/api';
import { format } from 'date-fns';
import ApiService from '../services/api';
import socketService from '../services/socket';
import { ColumnsType } from 'antd/es/table';

const { Title, Text } = Typography;

/**
 * Dashboard component showing an overview of the gRPC system
 */
const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  // State management
  const [services, setServices] = useState<GrpcServiceInfo[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<StatsData>({
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    avgResponseTime: 0,
  });
  const [loading, setLoading] = useState({
    services: false,
    logs: false,
    stats: false,
  });
  const [errors, setErrors] = useState({
    services: null as string | null,
    logs: null as string | null,
    stats: null as string | null,
  });
  const [refreshInterval, setRefreshInterval] = useState<number | null>(null);
  const [socketConnected, setSocketConnected] = useState(socketService.isConnected());

  // Load refresh interval from settings
  useEffect(() => {
    const savedSettings = localStorage.getItem('grpcDashboardSettings');
    if (savedSettings) {
      try {
        const { refreshInterval } = JSON.parse(savedSettings);
        if (refreshInterval > 0) {
          setRefreshInterval(refreshInterval * 1000); // Convert to milliseconds
        }
      } catch (error) {
        console.error('Failed to parse saved settings:', error);
      }
    }

    // Set up socket connection listener
    const connectHandler = () => setSocketConnected(true);
    const disconnectHandler = () => setSocketConnected(false);

    socketService.on('connect', connectHandler);
    socketService.on('disconnect', disconnectHandler);

    return () => {
      socketService.off('connect', connectHandler);
      socketService.off('disconnect', disconnectHandler);
    };
  }, []);

  // Fetch services data
  const fetchServices = useCallback(async () => {
    try {
      setLoading((prev) => ({ ...prev, services: true }));
      setErrors((prev) => ({ ...prev, services: null }));
      const servicesData = await ApiService.getServices();
      setServices(servicesData);
    } catch (error) {
      console.error('Error fetching services:', error);
      setErrors((prev) => ({ ...prev, services: 'Failed to fetch services data' }));
    } finally {
      setLoading((prev) => ({ ...prev, services: false }));
    }
  }, []);

  // Fetch logs data
  const fetchLogs = useCallback(async () => {
    try {
      setLoading((prev) => ({ ...prev, logs: true }));
      setErrors((prev) => ({ ...prev, logs: null }));
      const logsData = await ApiService.getLogs({ limit: 5 });
      setLogs(logsData);
    } catch (error) {
      console.error('Error fetching logs:', error);
      setErrors((prev) => ({ ...prev, logs: 'Failed to fetch recent logs' }));
    } finally {
      setLoading((prev) => ({ ...prev, logs: false }));
    }
  }, []);

  // Fetch stats data
  const fetchStats = useCallback(async () => {
    try {
      setLoading((prev) => ({ ...prev, stats: true }));
      setErrors((prev) => ({ ...prev, stats: null }));
      const statsData = await ApiService.getStats();
      setStats(statsData);
    } catch (error) {
      console.error('Error fetching stats:', error);
      setErrors((prev) => ({ ...prev, stats: 'Failed to fetch statistics data' }));
    } finally {
      setLoading((prev) => ({ ...prev, stats: false }));
    }
  }, []);

  // Fetch all data
  const fetchData = useCallback(async () => {
    await Promise.all([fetchServices(), fetchLogs(), fetchStats()]);
  }, [fetchServices, fetchLogs, fetchStats]);

  // Handle service updates from WebSocket
  const handleServicesUpdate = useCallback((servicesData: GrpcServiceInfo[]) => {
    setServices(servicesData);
  }, []);

  // Handle log updates from WebSocket
  const handleLogUpdate = useCallback((log: LogEntry) => {
    setLogs((prev) => [log, ...prev].slice(0, 5));
  }, []);

  // Handle stats updates from WebSocket
  const handleStatsUpdate = useCallback((statsData: StatsData) => {
    setStats(statsData);
  }, []);

  // Set up WebSocket listeners and fetch data on component mount
  useEffect(() => {
    fetchData();

    // Register socket event handlers
    const unsubscribeServices = socketService.on('services', handleServicesUpdate);
    const unsubscribeLog = socketService.on('log', handleLogUpdate);
    const unsubscribeStats = socketService.on('stats', handleStatsUpdate);

    // Request data from WebSocket if connected
    if (socketService.isConnected()) {
      socketService.getServices();
      socketService.getLogs({ limit: 5 });
      socketService.getStats();
    }

    // Auto-refresh setup
    let intervalId: number | undefined;
    if (refreshInterval) {
      intervalId = window.setInterval(() => {
        if (socketService.isConnected()) {
          socketService.getServices();
          socketService.getLogs({ limit: 5 });
          socketService.getStats();
        } else {
          fetchData();
        }
      }, refreshInterval);
    }

    // Clean up on unmount
    return () => {
      unsubscribeServices();
      unsubscribeLog();
      unsubscribeStats();
      if (intervalId) clearInterval(intervalId);
      ApiService.abortAllRequests(); // Abort any pending fetch requests
    };
  }, [fetchData, handleServicesUpdate, handleLogUpdate, handleStatsUpdate, refreshInterval]);

  // Format date for display
  const formatDate = useCallback((dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM dd, yyyy HH:mm:ss');
    } catch (e) {
      return dateStr;
    }
  }, []);

  // Log level tag color mapping
  const getLogLevelColor = useCallback((level: string) => {
    switch (level) {
      case 'error':
        return 'red';
      case 'warn':
        return 'orange';
      case 'info':
        return 'blue';
      case 'debug':
        return 'purple';
      case 'verbose':
        return 'gray';
      default:
        return 'default';
    }
  }, []);

  // Calculate success rate percentage
  const successRate = useMemo(() => {
    if (stats.totalRequests === 0) return 0;
    return ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1);
  }, [stats.totalRequests, stats.successfulRequests]);

  // Calculate if performance is good or bad
  const performanceLevel = useMemo(() => {
    // Success rate threshold
    const successRateVal = stats.totalRequests ? stats.successfulRequests / stats.totalRequests : 0;
    const successRateStatus = successRateVal > 0.95 ? 'good' : 'bad';

    // Response time threshold
    const responseTimeStatus = stats.avgResponseTime < 50 ? 'good' : 'bad';

    return {
      successRate: successRateStatus,
      responseTime: responseTimeStatus,
      overall: successRateStatus === 'good' && responseTimeStatus === 'good' ? 'good' : 'bad',
    };
  }, [stats]);

  // Table columns for recent logs
  const logColumns: ColumnsType<LogEntry> = useMemo(
    () => [
      {
        title: 'Time',
        dataIndex: 'timestamp',
        key: 'timestamp',
        width: 180,
        render: (timestamp: string) => (
          <Tooltip title={formatDate(timestamp)}>{formatDate(timestamp)}</Tooltip>
        ),
      },
      {
        title: 'Level',
        dataIndex: 'level',
        key: 'level',
        width: 100,
        render: (level: string) => <Tag color={getLogLevelColor(level)}>{level.toUpperCase()}</Tag>,
      },
      {
        title: 'Context',
        dataIndex: 'context',
        key: 'context',
        width: 150,
        render: (context: string) => <Tag>{context}</Tag>,
      },
      {
        title: 'Message',
        dataIndex: 'message',
        key: 'message',
        render: (message: string) => (
          <div
            style={{
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {message}
          </div>
        ),
      },
    ],
    [formatDate, getLogLevelColor],
  );

  // Table columns for services
  const serviceColumns: ColumnsType<GrpcServiceInfo> = useMemo(
    () => [
      {
        title: 'Service',
        dataIndex: 'name',
        key: 'name',
        render: (text: string, record: GrpcServiceInfo) => (
          <Space>
            <span>{text}</span>
            <Tag color="blue">{record.package}</Tag>
          </Space>
        ),
      },
      {
        title: 'Methods',
        dataIndex: 'methods',
        key: 'methods',
        render: (methods: string[]) => (
          <Space size={[0, 4]} wrap>
            {methods.slice(0, 3).map((method) => (
              <Tag key={method} color="geekblue">
                {method}
              </Tag>
            ))}
            {methods.length > 3 && (
              <Tooltip title={methods.slice(3).join(', ')}>
                <Tag>+{methods.length - 3} more</Tag>
              </Tooltip>
            )}
          </Space>
        ),
      },
      {
        title: 'URL',
        dataIndex: 'url',
        key: 'url',
        render: (url: string) => (
          <Tooltip title={url}>
            <div
              style={{
                maxWidth: 250,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              <LinkOutlined style={{ marginRight: 5 }} />
              {url}
            </div>
          </Tooltip>
        ),
      },
      {
        title: 'Status',
        key: 'status',
        dataIndex: 'status',
        render: (status: string) => (
          <Tag color={status === 'active' ? 'green' : 'red'}>{status.toUpperCase()}</Tag>
        ),
      },
    ],
    [],
  );

  // Calculate service statistics
  const serviceStats = useMemo(() => {
    const total = services.length;
    const active = services.filter((s) => s.status === 'active').length;
    const inactive = total - active;
    const percent = total > 0 ? (active / total) * 100 : 0;

    return { total, active, inactive, percent };
  }, [services]);

  // Render the statistics cards
  const renderStatCards = () => (
    <Row gutter={[16, 16]} className="dashboard-card">
      <Col xs={24} sm={12} md={6}>
        <Card bordered={false} className="stat-card" loading={loading.services}>
          <Statistic
            title="Active Services"
            value={serviceStats.active}
            suffix={`/ ${serviceStats.total}`}
            valueStyle={{ color: serviceStats.percent > 80 ? '#3f8600' : '#cf1322' }}
            prefix={<ApiOutlined />}
          />
          {serviceStats.inactive > 0 && (
            <Text type="secondary">
              {serviceStats.inactive} inactive service{serviceStats.inactive > 1 ? 's' : ''}
            </Text>
          )}
        </Card>
      </Col>
      <Col xs={24} sm={12} md={6}>
        <Card bordered={false} className="stat-card" loading={loading.stats}>
          <Statistic
            title="Total Requests"
            value={stats.totalRequests}
            valueStyle={{ color: '#1890ff' }}
            prefix={<DatabaseOutlined />}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} md={6}>
        <Card bordered={false} className="stat-card" loading={loading.stats}>
          <Statistic
            title="Success Rate"
            value={successRate}
            suffix="%"
            precision={1}
            valueStyle={{
              color: performanceLevel.successRate === 'good' ? '#3f8600' : '#cf1322',
            }}
            prefix={<CheckCircleOutlined />}
          />
          <Text type="secondary">
            {stats.successfulRequests} successful / {stats.failedRequests} failed
          </Text>
        </Card>
      </Col>
      <Col xs={24} sm={12} md={6}>
        <Card bordered={false} className="stat-card" loading={loading.stats}>
          <Statistic
            title="Avg Response Time"
            value={stats.avgResponseTime}
            suffix="ms"
            precision={1}
            valueStyle={{
              color: performanceLevel.responseTime === 'good' ? '#3f8600' : '#cf1322',
            }}
            prefix={<FieldTimeOutlined />}
          />
        </Card>
      </Col>
    </Row>
  );

  return (
    <div className="dashboard-container">
      <div className="table-header-actions">
        <Space direction="vertical" size={1} style={{ width: '100%' }}>
          <Title level={4}>Dashboard Overview</Title>
          {!socketConnected && (
            <Badge status="warning" text="WebSocket disconnected - using HTTP fallback" />
          )}
        </Space>
        <Button
          type="primary"
          icon={<ReloadOutlined />}
          onClick={fetchData}
          loading={loading.services || loading.logs || loading.stats}
        >
          Refresh
        </Button>
      </div>

      {/* Display errors if any */}
      {(errors.services || errors.logs || errors.stats) && (
        <Alert
          message="Error loading data"
          description={
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {errors.services && <li>{errors.services}</li>}
              {errors.logs && <li>{errors.logs}</li>}
              {errors.stats && <li>{errors.stats}</li>}
            </ul>
          }
          type="error"
          showIcon
          closable
          style={{ marginBottom: 16 }}
        />
      )}

      {/* System Status Overview */}
      {performanceLevel.overall === 'bad' && !loading.stats && (
        <Alert
          message="System Performance Warning"
          description={
            <div>
              {performanceLevel.successRate === 'bad' && (
                <div>• Low success rate ({successRate}%) - check for service errors</div>
              )}
              {performanceLevel.responseTime === 'bad' && (
                <div>
                  • High response time ({stats.avgResponseTime}ms) - check for performance
                  bottlenecks
                </div>
              )}
            </div>
          }
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Statistics Cards */}
      {renderStatCards()}

      {/* Recent Logs */}
      <Card
        title={
          <Space>
            <span>Recent Activity</span>
            {logs.length > 0 && (
              <Tag color={logs.some((log) => log.level === 'error') ? 'red' : 'green'}>
                {logs.some((log) => log.level === 'error') ? 'Issues detected' : 'All good'}
              </Tag>
            )}
          </Space>
        }
        className="dashboard-card"
        extra={
          <Button type="primary" ghost onClick={() => navigate('/logs')}>
            View All
          </Button>
        }
      >
        {loading.logs && !logs.length ? (
          <Skeleton active paragraph={{ rows: 5 }} />
        ) : (
          <Table
            dataSource={logs}
            columns={logColumns}
            rowKey="id"
            pagination={false}
            loading={loading.logs}
            locale={{
              emptyText: errors.logs ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Failed to load logs" />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No recent activity" />
              ),
            }}
            size="small"
          />
        )}
      </Card>

      {/* Services Status */}
      <Card
        title={
          <Space>
            <span>Services Status</span>
            {serviceStats.inactive > 0 && (
              <Tag color="red">
                {serviceStats.inactive} service{serviceStats.inactive > 1 ? 's' : ''} inactive
              </Tag>
            )}
          </Space>
        }
        className="dashboard-card"
        extra={
          <Button type="primary" ghost onClick={() => navigate('/services')}>
            View All
          </Button>
        }
      >
        {loading.services && !services.length ? (
          <Skeleton active paragraph={{ rows: 5 }} />
        ) : (
          <Table
            dataSource={services}
            columns={serviceColumns}
            rowKey="id"
            pagination={false}
            loading={loading.services}
            locale={{
              emptyText: errors.services ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Failed to load services" />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No services found" />
              ),
            }}
            size="small"
          />
        )}
      </Card>
    </div>
  );
};

export default Dashboard;
