import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Typography,
  Button,
  Divider,
  Alert,
  Tooltip,
  Spin,
  Badge,
  Progress,
  Tabs,
  Empty,
  Space,
} from 'antd';
import {
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FieldTimeOutlined,
  ApiOutlined,
  ClockCircleOutlined,
  DesktopOutlined,
  CloudServerOutlined,
  InfoCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { StatsData, SystemInfo } from '../types/api';
import ApiService from '../services/api';
import socketService from '../services/socket';

const { Title, Text, Paragraph } = Typography;
const { TabPane } = Tabs;

/**
 * Stats component for displaying system statistics and performance metrics
 */
const Stats: React.FC = () => {
  const [stats, setStats] = useState<StatsData>({
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    avgResponseTime: 0,
  });
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
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

  // Fetch statistics data
  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const statsData = await ApiService.getStats();
      setStats(statsData);

      // Also fetch system info
      const sysInfo = await ApiService.getSystemInfo();
      setSystemInfo(sysInfo);

      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching statistics:', error);
      setError('Failed to fetch statistics data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle stats updates from WebSocket
  const handleStatsUpdate = useCallback((statsData: StatsData) => {
    setStats(statsData);
    setLastUpdated(new Date());
  }, []);

  // Set up WebSocket listeners and fetch data on component mount
  useEffect(() => {
    fetchStats();

    // Register socket event handler for stats updates
    const unsubscribeStats = socketService.on('stats', handleStatsUpdate);

    // Request data from WebSocket if connected
    if (socketService.isConnected()) {
      socketService.getStats();
    }

    // Auto-refresh setup
    let intervalId: number | undefined;
    if (refreshInterval) {
      intervalId = window.setInterval(() => {
        if (socketService.isConnected()) {
          socketService.getStats();
        } else {
          fetchStats();
        }
      }, refreshInterval);
    }

    // Clean up on unmount
    return () => {
      unsubscribeStats();
      if (intervalId) clearInterval(intervalId);
      ApiService.abortAllRequests(); // Abort any pending fetch requests
    };
  }, [fetchStats, handleStatsUpdate, refreshInterval]);

  // Calculate success rate percentage
  const successRate = useMemo(() => {
    if (stats.totalRequests === 0) return 0;
    return ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1);
  }, [stats.totalRequests, stats.successfulRequests]);

  // Calculate health status
  const healthStatus = useMemo(() => {
    const successRateNum = parseFloat(successRate);
    const responseTimeOk = stats.avgResponseTime < 50;

    if (successRateNum > 95 && responseTimeOk) {
      return { status: 'healthy', color: 'green', text: 'Healthy' };
    } else if (successRateNum > 80 && stats.avgResponseTime < 200) {
      return { status: 'warning', color: 'orange', text: 'Degraded' };
    } else {
      return { status: 'unhealthy', color: 'red', text: 'Unhealthy' };
    }
  }, [successRate, stats.avgResponseTime]);

  // Format uptime in a human-readable way
  const formatUptime = useCallback((seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    // Create array of parts that exist
    const parts = [];
    if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
    if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
    if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
    if (remainingSeconds > 0 || parts.length === 0)
      parts.push(`${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`);

    return parts.join(', ');
  }, []);

  // Format time since last update
  const lastUpdateText = useMemo(() => {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - lastUpdated.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return `${diffInSeconds} second${diffInSeconds !== 1 ? 's' : ''} ago`;
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    } else {
      return lastUpdated.toLocaleTimeString();
    }
  }, [lastUpdated]);

  return (
    <div className="stats-container">
      <div className="table-header-actions">
        <Space direction="vertical" size={0} align="start">
          <Title level={4}>System Statistics</Title>
          {!socketConnected && (
            <Badge status="warning" text="WebSocket disconnected - using HTTP fallback" />
          )}
        </Space>
        <Space>
          <Text type="secondary">Last updated: {lastUpdateText}</Text>
          <Button type="primary" icon={<ReloadOutlined />} onClick={fetchStats} loading={loading}>
            Refresh
          </Button>
        </Space>
      </div>

      {error && (
        <Alert
          message="Error"
          description={error}
          type="error"
          showIcon
          closable
          style={{ marginBottom: 16 }}
        />
      )}

      <Spin spinning={loading && !stats.totalRequests && !systemInfo}>
        <Tabs defaultActiveKey="performance">
          <TabPane
            tab={
              <span>
                <FieldTimeOutlined />
                Performance Metrics
              </span>
            }
            key="performance"
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} md={12} xl={6}>
                <Card bordered={false} className="stat-card">
                  <Statistic
                    title={
                      <Tooltip title="Total number of gRPC requests processed">
                        <Space>
                          <span>Total Requests</span>
                          <InfoCircleOutlined style={{ color: 'rgba(0, 0, 0, 0.45)' }} />
                        </Space>
                      </Tooltip>
                    }
                    value={stats.totalRequests}
                    valueStyle={{ color: '#1890ff' }}
                    prefix={<ApiOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={24} md={12} xl={6}>
                <Card bordered={false} className="stat-card">
                  <Statistic
                    title={
                      <Tooltip title="Number of successful gRPC requests">
                        <Space>
                          <span>Successful Requests</span>
                          <InfoCircleOutlined style={{ color: 'rgba(0, 0, 0, 0.45)' }} />
                        </Space>
                      </Tooltip>
                    }
                    value={stats.successfulRequests}
                    valueStyle={{ color: '#3f8600' }}
                    prefix={<CheckCircleOutlined />}
                  />
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {stats.successfulRequests} of {stats.totalRequests} requests
                    </Text>
                  </div>
                </Card>
              </Col>
              <Col xs={24} md={12} xl={6}>
                <Card bordered={false} className="stat-card">
                  <Statistic
                    title={
                      <Tooltip title="Number of failed gRPC requests">
                        <Space>
                          <span>Failed Requests</span>
                          <InfoCircleOutlined style={{ color: 'rgba(0, 0, 0, 0.45)' }} />
                        </Space>
                      </Tooltip>
                    }
                    value={stats.failedRequests}
                    valueStyle={{ color: '#cf1322' }}
                    prefix={<CloseCircleOutlined />}
                  />
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {stats.failedRequests} of {stats.totalRequests} requests
                    </Text>
                  </div>
                </Card>
              </Col>
              <Col xs={24} md={12} xl={6}>
                <Card bordered={false} className="stat-card">
                  <Statistic
                    title={
                      <Tooltip title="Percentage of successful requests">
                        <Space>
                          <span>Success Rate</span>
                          <InfoCircleOutlined style={{ color: 'rgba(0, 0, 0, 0.45)' }} />
                        </Space>
                      </Tooltip>
                    }
                    value={successRate}
                    suffix="%"
                    precision={1}
                    valueStyle={{
                      color:
                        parseFloat(successRate) > 95
                          ? '#3f8600'
                          : parseFloat(successRate) > 80
                            ? '#faad14'
                            : '#cf1322',
                    }}
                    prefix={<CheckCircleOutlined />}
                  />
                  <Progress
                    percent={parseFloat(successRate)}
                    showInfo={false}
                    status={
                      parseFloat(successRate) > 95
                        ? 'success'
                        : parseFloat(successRate) > 80
                          ? 'normal'
                          : 'exception'
                    }
                    style={{ marginTop: 8 }}
                  />
                </Card>
              </Col>
            </Row>

            <Card
              title={
                <Space>
                  <FieldTimeOutlined />
                  <span>Response Time</span>
                </Space>
              }
              bordered={false}
              style={{ marginTop: 16 }}
            >
              <Row gutter={16}>
                <Col span={24} md={12}>
                  <Statistic
                    title={
                      <Tooltip title="Average response time for gRPC requests">
                        <Space>
                          <span>Average Response Time</span>
                          <InfoCircleOutlined style={{ color: 'rgba(0, 0, 0, 0.45)' }} />
                        </Space>
                      </Tooltip>
                    }
                    value={stats.avgResponseTime}
                    suffix="ms"
                    precision={1}
                    valueStyle={{
                      color:
                        stats.avgResponseTime < 50
                          ? '#3f8600'
                          : stats.avgResponseTime < 200
                            ? '#faad14'
                            : '#cf1322',
                      fontSize: '2rem',
                    }}
                  />
                  <div style={{ marginTop: 16 }}>
                    <Space>
                      <Badge status={stats.avgResponseTime < 50 ? 'success' : 'warning'} />
                      <Text>
                        {stats.avgResponseTime < 50
                          ? 'Good performance'
                          : stats.avgResponseTime < 200
                            ? 'Acceptable performance'
                            : 'Poor performance'}
                      </Text>
                    </Space>
                  </div>
                </Col>
                <Col span={24} md={12}>
                  <Card title="System Health" size="small" style={{ height: '100%' }}>
                    <div style={{ textAlign: 'center', padding: '8px 0' }}>
                      <Badge
                        status={
                          healthStatus.status === 'healthy'
                            ? 'success'
                            : healthStatus.status === 'warning'
                              ? 'warning'
                              : 'error'
                        }
                        text={
                          <Text
                            style={{
                              fontSize: '16px',
                              fontWeight: 500,
                              color:
                                healthStatus.status === 'healthy'
                                  ? '#3f8600'
                                  : healthStatus.status === 'warning'
                                    ? '#faad14'
                                    : '#cf1322',
                            }}
                          >
                            System is {healthStatus.text}
                          </Text>
                        }
                      />
                    </div>
                    <div style={{ marginTop: 16 }}>
                      {healthStatus.status !== 'healthy' && (
                        <Alert
                          message="Performance Issues Detected"
                          description={
                            <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
                              {parseFloat(successRate) < 95 && (
                                <li>Low success rate ({successRate}%)</li>
                              )}
                              {stats.avgResponseTime >= 50 && (
                                <li>High response time ({stats.avgResponseTime}ms)</li>
                              )}
                            </ul>
                          }
                          type="warning"
                          showIcon
                          icon={<WarningOutlined />}
                        />
                      )}
                      {healthStatus.status === 'healthy' && (
                        <Alert
                          message="All Systems Operational"
                          description="All performance metrics are within normal ranges."
                          type="success"
                          showIcon
                        />
                      )}
                    </div>
                  </Card>
                </Col>
              </Row>
            </Card>
          </TabPane>

          <TabPane
            tab={
              <span>
                <CloudServerOutlined />
                System Information
              </span>
            }
            key="system"
          >
            {systemInfo ? (
              <Row gutter={[16, 16]}>
                <Col span={24}>
                  <Card
                    title={
                      <Space>
                        <DesktopOutlined />
                        <span>Environment</span>
                      </Space>
                    }
                    bordered={false}
                  >
                    <Row gutter={[16, 16]}>
                      <Col xs={24} sm={12} md={8}>
                        <Statistic
                          title="Version"
                          value={systemInfo.version}
                          valueStyle={{ fontSize: '1rem' }}
                        />
                      </Col>
                      <Col xs={24} sm={12} md={8}>
                        <Statistic
                          title="Node.js Version"
                          value={systemInfo.nodeVersion}
                          valueStyle={{ fontSize: '1rem' }}
                        />
                      </Col>
                      <Col xs={24} sm={12} md={8}>
                        <Statistic
                          title="Platform"
                          value={systemInfo.platform}
                          valueStyle={{ fontSize: '1rem' }}
                        />
                      </Col>
                    </Row>
                  </Card>
                </Col>

                <Col span={24}>
                  <Card
                    title={
                      <Space>
                        <ClockCircleOutlined />
                        <span>System Status</span>
                      </Space>
                    }
                    bordered={false}
                  >
                    <Row gutter={[16, 16]}>
                      <Col xs={24} sm={12} md={6}>
                        <Statistic
                          title={
                            <Tooltip title="How long the system has been running">
                              <Space>
                                <span>Uptime</span>
                                <InfoCircleOutlined style={{ color: 'rgba(0, 0, 0, 0.45)' }} />
                              </Space>
                            </Tooltip>
                          }
                          value={formatUptime(systemInfo.uptime)}
                          valueStyle={{ fontSize: '1rem' }}
                        />
                      </Col>
                      <Col xs={24} sm={12} md={6}>
                        <Statistic
                          title="Services Count"
                          value={systemInfo.servicesCount}
                          prefix={<ApiOutlined />}
                        />
                      </Col>
                      <Col xs={24} sm={12} md={6}>
                        <Statistic
                          title="Connections Count"
                          value={systemInfo.connectionsCount}
                          prefix={<ApiOutlined />}
                        />
                      </Col>
                      <Col xs={24} sm={12} md={6}>
                        <Statistic
                          title="Logs Count"
                          value={systemInfo.logsCount || 0}
                          prefix={<InfoCircleOutlined />}
                        />
                      </Col>
                    </Row>
                  </Card>
                </Col>
              </Row>
            ) : (
              <Empty
                description={
                  error ? 'Failed to load system information' : 'No system information available'
                }
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            )}
          </TabPane>
        </Tabs>
      </Spin>

      <Divider />

      <Alert
        message="Performance Metrics"
        description={
          <div>
            <Paragraph>
              In a production environment, this page would include detailed charts showing:
            </Paragraph>
            <ul>
              <li>Request volume over time</li>
              <li>Success/error rates by time period</li>
              <li>Response time distribution</li>
              <li>Performance metrics by service and method</li>
              <li>Resource utilization (CPU, memory, network)</li>
            </ul>
            <Paragraph>
              These metrics would help identify performance bottlenecks and troubleshoot issues.
            </Paragraph>
          </div>
        }
        type="info"
        showIcon
      />
    </div>
  );
};

export default Stats;
