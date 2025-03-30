import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Table,
  Typography,
  Button,
  Card,
  Drawer,
  Descriptions,
  Badge,
  Space,
  Tag,
  Alert,
  Tooltip,
  Empty,
  Input,
  Spin,
} from 'antd';
import {
  ReloadOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  SearchOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import { GrpcConnection } from '../types/api';
import { format, formatDistanceToNow } from 'date-fns';
import ApiService from '../services/api';
import socketService from '../services/socket';
import { ColumnsType } from 'antd/es/table';

const { Title, Text } = Typography;

/**
 * Connections component displays and manages gRPC connections
 */
const Connections: React.FC = () => {
  // State management
  const [connections, setConnections] = useState<GrpcConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<GrpcConnection | null>(null);
  const [searchText, setSearchText] = useState('');
  const [refreshInterval, setRefreshInterval] = useState<number | null>(null);

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
  }, []);

  // Fetch connections data
  const fetchConnections = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await ApiService.getConnections();
      setConnections(data);
    } catch (error) {
      console.error('Error fetching connections:', error);
      setError('Failed to fetch connections. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle connection updates from WebSocket
  const handleConnectionUpdate = useCallback((connection: GrpcConnection) => {
    setConnections((prev) => {
      const index = prev.findIndex((c) => c.id === connection.id);
      if (index >= 0) {
        // Update existing connection
        const newConnections = [...prev];
        newConnections[index] = connection;
        return newConnections;
      } else {
        // Add new connection
        return [...prev, connection];
      }
    });
  }, []);

  // Handle bulk connections update from WebSocket
  const handleConnectionsUpdate = useCallback((connectionsData: GrpcConnection[]) => {
    setConnections(connectionsData);
  }, []);

  // Set up WebSocket listeners and fetch data on component mount
  useEffect(() => {
    fetchConnections();

    // Register socket event handlers
    const unsubscribeConnection = socketService.on('connection', handleConnectionUpdate);
    const unsubscribeConnections = socketService.on('connections', handleConnectionsUpdate);

    // Request data from WebSocket
    if (socketService.isConnected()) {
      socketService.getConnections();
    }

    // Auto-refresh setup
    let intervalId: number | undefined;
    if (refreshInterval) {
      intervalId = window.setInterval(() => {
        if (socketService.isConnected()) {
          socketService.getConnections();
        } else {
          fetchConnections();
        }
      }, refreshInterval);
    }

    // Clean up on unmount
    return () => {
      unsubscribeConnection();
      unsubscribeConnections();
      if (intervalId) clearInterval(intervalId);
      ApiService.abortAllRequests(); // Abort any pending fetch requests
    };
  }, [fetchConnections, handleConnectionUpdate, handleConnectionsUpdate, refreshInterval]);

  // Show connection details
  const showConnectionDetails = useCallback((connection: GrpcConnection) => {
    setSelectedConnection(connection);
    setDrawerVisible(true);
  }, []);

  // Format date for display
  const formatDate = useCallback((dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM dd, yyyy HH:mm:ss');
    } catch (e) {
      return dateStr;
    }
  }, []);

  // Format time ago
  const formatTimeAgo = useCallback((dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
    } catch (e) {
      return dateStr;
    }
  }, []);

  // Get status icon and color
  const getStatusDisplay = useCallback((status: string) => {
    let color: string;
    let icon: React.ReactNode;
    let text: string = status.toUpperCase();

    switch (status) {
      case 'connected':
        color = 'green';
        icon = <CheckCircleOutlined />;
        break;
      case 'disconnected':
        color = 'orange';
        icon = <ClockCircleOutlined />;
        break;
      case 'error':
        color = 'red';
        icon = <CloseCircleOutlined />;
        break;
      default:
        color = 'default';
        icon = <InfoCircleOutlined />;
        text = 'UNKNOWN';
    }

    return (
      <Space>
        {icon}
        <Badge status={color as 'success' | 'warning' | 'error' | 'default'} text={text} />
      </Space>
    );
  }, []);

  // Filter connections based on search text
  const filteredConnections = useMemo(() => {
    if (!searchText) return connections;

    const searchLower = searchText.toLowerCase();
    return connections.filter(
      (conn) =>
        conn.clientId.toLowerCase().includes(searchLower) ||
        conn.service.toLowerCase().includes(searchLower) ||
        conn.url.toLowerCase().includes(searchLower) ||
        conn.status.toLowerCase().includes(searchLower),
    );
  }, [connections, searchText]);

  // Table columns
  const columns: ColumnsType<GrpcConnection> = useMemo(
    () => [
      {
        title: 'Client ID',
        dataIndex: 'clientId',
        key: 'clientId',
        sorter: (a, b) => a.clientId.localeCompare(b.clientId),
        render: (text: string) => (
          <Tooltip title={text}>
            <div
              style={{
                maxWidth: 150,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {text}
            </div>
          </Tooltip>
        ),
      },
      {
        title: 'Service',
        dataIndex: 'service',
        key: 'service',
        sorter: (a, b) => a.service.localeCompare(b.service),
        render: (text: string) => <Tag color="blue">{text}</Tag>,
        filters: Array.from(new Set(connections.map((conn) => conn.service))).map((service) => ({
          text: service,
          value: service,
        })),
        onFilter: (value, record) => record.service === value,
      },
      {
        title: 'URL',
        dataIndex: 'url',
        key: 'url',
        render: (text: string) => (
          <Tooltip title={text}>
            <div
              style={{
                maxWidth: 200,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              <LinkOutlined style={{ marginRight: 5 }} />
              {text}
            </div>
          </Tooltip>
        ),
      },
      {
        title: 'Status',
        key: 'status',
        dataIndex: 'status',
        render: (status: string) => getStatusDisplay(status),
        sorter: (a, b) => a.status.localeCompare(b.status),
        filters: [
          { text: 'Connected', value: 'connected' },
          { text: 'Disconnected', value: 'disconnected' },
          { text: 'Error', value: 'error' },
        ],
        onFilter: (value, record) => record.status === value,
      },
      {
        title: 'Established',
        dataIndex: 'established',
        key: 'established',
        render: (date: string) => <Tooltip title={formatDate(date)}>{formatTimeAgo(date)}</Tooltip>,
        sorter: (a, b) => new Date(a.established).getTime() - new Date(b.established).getTime(),
      },
      {
        title: 'Last Activity',
        dataIndex: 'lastActivity',
        key: 'lastActivity',
        render: (date: string) => <Tooltip title={formatDate(date)}>{formatTimeAgo(date)}</Tooltip>,
        defaultSortOrder: 'descend',
        sorter: (a, b) => new Date(a.lastActivity).getTime() - new Date(b.lastActivity).getTime(),
      },
      {
        title: 'Action',
        key: 'action',
        width: 100,
        render: (_: any, record: GrpcConnection) => (
          <Button
            type="primary"
            size="small"
            icon={<InfoCircleOutlined />}
            onClick={() => showConnectionDetails(record)}
          >
            Details
          </Button>
        ),
      },
    ],
    [connections, formatDate, formatTimeAgo, getStatusDisplay, showConnectionDetails],
  );

  // Summary component for the table
  const tableSummary = useMemo(() => {
    const totalConnections = filteredConnections.length;
    const connectedCount = filteredConnections.filter((c) => c.status === 'connected').length;
    const disconnectedCount = filteredConnections.filter((c) => c.status === 'disconnected').length;
    const errorCount = filteredConnections.filter((c) => c.status === 'error').length;

    return (
      <Table.Summary fixed>
        <Table.Summary.Row>
          <Table.Summary.Cell index={0} colSpan={7}>
            <Space size="large">
              <Text strong>Total: {totalConnections}</Text>
              <Text>
                <Badge status="success" text={`Connected: ${connectedCount}`} />
              </Text>
              <Text>
                <Badge status="warning" text={`Disconnected: ${disconnectedCount}`} />
              </Text>
              <Text>
                <Badge status="error" text={`Error: ${errorCount}`} />
              </Text>
            </Space>
          </Table.Summary.Cell>
        </Table.Summary.Row>
      </Table.Summary>
    );
  }, [filteredConnections]);

  return (
    <div className="connections-container">
      <div className="table-header-actions">
        <Title level={4}>gRPC Connections</Title>
        <Space>
          <Input
            placeholder="Search connections"
            prefix={<SearchOutlined />}
            onChange={(e) => setSearchText(e.target.value)}
            value={searchText}
            allowClear
            style={{ width: 250 }}
          />
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={fetchConnections}
            loading={loading}
          >
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

      <Card bordered={false}>
        <Spin spinning={loading} tip="Loading connections...">
          <Table
            dataSource={filteredConnections}
            columns={columns}
            rowKey="id"
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} connections`,
              position: ['bottomRight'],
            }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <span>
                      No active connections found
                      <br />
                      <Button type="link" onClick={fetchConnections} style={{ padding: 0 }}>
                        Refresh
                      </Button>
                    </span>
                  }
                />
              ),
            }}
            summary={() => tableSummary}
            sticky
            scroll={{ x: 'max-content' }}
          />
        </Spin>
      </Card>

      {/* Connection Details Drawer */}
      <Drawer
        title={
          <Space>
            <InfoCircleOutlined />
            Connection Details
            {selectedConnection && (
              <Tag
                color={
                  selectedConnection.status === 'connected'
                    ? 'green'
                    : selectedConnection.status === 'disconnected'
                      ? 'orange'
                      : 'red'
                }
              >
                {selectedConnection.status.toUpperCase()}
              </Tag>
            )}
          </Space>
        }
        placement="right"
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
        width={550}
        footer={
          <div style={{ textAlign: 'right' }}>
            <Button onClick={() => setDrawerVisible(false)}>Close</Button>
          </div>
        }
      >
        {selectedConnection && (
          <>
            <Descriptions bordered column={1} size="small" labelStyle={{ fontWeight: 500 }}>
              <Descriptions.Item label="Client ID">{selectedConnection.clientId}</Descriptions.Item>
              <Descriptions.Item label="Service">
                <Tag color="blue">{selectedConnection.service}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="URL">
                <Text copyable>{selectedConnection.url}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                {getStatusDisplay(selectedConnection.status)}
              </Descriptions.Item>
              <Descriptions.Item label="Established">
                <div>{formatDate(selectedConnection.established)}</div>
                <div style={{ color: 'rgba(0, 0, 0, 0.45)', fontSize: '0.9em' }}>
                  ({formatTimeAgo(selectedConnection.established)})
                </div>
              </Descriptions.Item>
              <Descriptions.Item label="Last Activity">
                <div>{formatDate(selectedConnection.lastActivity)}</div>
                <div style={{ color: 'rgba(0, 0, 0, 0.45)', fontSize: '0.9em' }}>
                  ({formatTimeAgo(selectedConnection.lastActivity)})
                </div>
              </Descriptions.Item>
            </Descriptions>

            {selectedConnection.metadata && Object.keys(selectedConnection.metadata).length > 0 && (
              <>
                <Title level={5} style={{ marginTop: 24, marginBottom: 16 }}>
                  Metadata
                </Title>
                <Card size="small">
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    {Object.entries(selectedConnection.metadata).map(([key, value]) => (
                      <div key={key} style={{ display: 'flex' }}>
                        <Text strong style={{ minWidth: 120 }}>
                          {key}:
                        </Text>
                        <Text copyable={{ text: value }}>{value}</Text>
                      </div>
                    ))}
                  </Space>
                </Card>
              </>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
};

export default Connections;
