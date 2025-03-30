import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Table,
  Typography,
  Tag,
  Space,
  Button,
  Card,
  Drawer,
  Descriptions,
  Badge,
  Input,
  Alert,
  Tooltip,
  Empty,
  Spin,
  Statistic,
  Row,
  Col,
  notification,
  Popover,
} from 'antd';
import {
  ReloadOutlined,
  InfoCircleOutlined,
  SearchOutlined,
  LinkOutlined,
  DownloadOutlined,
  CopyOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import { GrpcServiceInfo } from '../types/api';
import { format, formatDistanceToNow } from 'date-fns';
import ApiService from '../services/api';
import socketService from '../services/socket';
import { ColumnsType } from 'antd/es/table';

const { Title, Text, Paragraph } = Typography;
const { Search } = Input;

/**
 * Services component displays and manages gRPC services
 */
const Services: React.FC = () => {
  // State management
  const [services, setServices] = useState<GrpcServiceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedService, setSelectedService] = useState<GrpcServiceInfo | null>(null);
  const [searchText, setSearchText] = useState('');
  const [refreshInterval, setRefreshInterval] = useState<number | null>(null);
  const [socketConnected, setSocketConnected] = useState(socketService.isConnected());
  const [copiedMethodId, setCopiedMethodId] = useState<string | null>(null);

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
      setLoading(true);
      setError(null);
      const data = await ApiService.getServices();
      setServices(data);
    } catch (error) {
      console.error('Error fetching services:', error);
      setError('Failed to fetch services. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle service updates from WebSocket
  const handleServicesUpdate = useCallback((servicesData: GrpcServiceInfo[]) => {
    setServices(servicesData);
  }, []);

  // Set up WebSocket listeners and fetch data on component mount
  useEffect(() => {
    fetchServices();

    // Register socket event handler for service updates
    const unsubscribeServices = socketService.on('services', handleServicesUpdate);

    // Request data from WebSocket if connected
    if (socketService.isConnected()) {
      socketService.getServices();
    }

    // Auto-refresh setup
    let intervalId: number | undefined;
    if (refreshInterval) {
      intervalId = window.setInterval(() => {
        if (socketService.isConnected()) {
          socketService.getServices();
        } else {
          fetchServices();
        }
      }, refreshInterval);
    }

    // Clean up on unmount
    return () => {
      unsubscribeServices();
      if (intervalId) clearInterval(intervalId);
      ApiService.abortAllRequests(); // Abort any pending fetch requests
    };
  }, [fetchServices, handleServicesUpdate, refreshInterval]);

  // Show service details
  const showServiceDetails = useCallback((service: GrpcServiceInfo) => {
    setSelectedService(service);
    setDrawerVisible(true);
  }, []);

  // Format date for display
  const formatDate = useCallback((dateStr?: string) => {
    if (!dateStr) return 'N/A';
    try {
      return format(new Date(dateStr), 'MMM dd, yyyy HH:mm:ss');
    } catch (e) {
      return dateStr;
    }
  }, []);

  // Format relative time
  const formatRelativeTime = useCallback((dateStr?: string) => {
    if (!dateStr) return 'N/A';
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
    } catch (e) {
      return dateStr;
    }
  }, []);

  // Copy URL to clipboard
  const copyToClipboard = useCallback((text: string, message: string = 'Copied to clipboard') => {
    navigator.clipboard.writeText(text).then(
      () => {
        notification.success({
          message: 'Copied',
          description: message,
          duration: 2,
        });
      },
      (err) => {
        console.error('Could not copy text: ', err);
        notification.error({
          message: 'Copy Failed',
          description: 'Failed to copy to clipboard',
          duration: 2,
        });
      },
    );
  }, []);

  // Copy method to clipboard
  const copyMethod = useCallback(
    (servicePackage: string, serviceName: string, methodName: string) => {
      const methodPath = `/${servicePackage}.${serviceName}/${methodName}`;
      copyToClipboard(methodPath, `Method path copied: ${methodPath}`);

      // Flash animation
      setCopiedMethodId(`${serviceName}-${methodName}`);
      setTimeout(() => setCopiedMethodId(null), 1000);
    },
    [copyToClipboard],
  );

  const filteredServices = useMemo(() => {
    if (!searchText) return services;

    const searchLower = searchText.toLowerCase();
    return services.filter(
      (service) =>
        service.name.toLowerCase().includes(searchLower) ||
        service.package.toLowerCase().includes(searchLower) ||
        service.url.toLowerCase().includes(searchLower) ||
        service.methods.some((method) => method.toLowerCase().includes(searchLower)),
    );
  }, [services, searchText]);

  // Export services to JSON
  const exportServicesToJson = useCallback(() => {
    try {
      const dataStr = JSON.stringify(filteredServices, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

      const exportFileDefaultName = `grpc-services-${new Date().toISOString().slice(0, 10)}.json`;

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();

      notification.success({
        message: 'Export Successful',
        description: `${filteredServices.length} services exported to JSON.`,
      });
    } catch (error) {
      console.error('Error exporting services:', error);
      notification.error({
        message: 'Export Failed',
        description: 'Failed to export services to JSON.',
      });
    }
  }, [filteredServices]);

  // Service statistics
  const serviceStats = useMemo(() => {
    const stats = {
      total: filteredServices.length,
      active: filteredServices.filter((s) => s.status === 'active').length,
      inactive: filteredServices.filter((s) => s.status === 'inactive').length,
      methodsCount: filteredServices.reduce((sum, service) => sum + service.methods.length, 0),
    };

    return stats;
  }, [filteredServices]);

  // Generate method popover content
  const getMethodsPopover = useCallback(
    (service: GrpcServiceInfo) => (
      <div style={{ maxWidth: 300, maxHeight: 300, overflow: 'auto' }}>
        <Space size={[0, 4]} direction="vertical" style={{ width: '100%' }}>
          {service.methods.map((method) => (
            <div
              key={method}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <Tag
                color="geekblue"
                style={{
                  transition: 'background-color 0.3s',
                  backgroundColor:
                    copiedMethodId === `${service.name}-${method}` ? '#52c41a' : undefined,
                }}
              >
                {method}
              </Tag>
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                onClick={() => copyMethod(service.package, service.name, method)}
                style={{ marginLeft: 8 }}
              />
            </div>
          ))}
        </Space>
      </div>
    ),
    [copyMethod, copiedMethodId],
  );

  // Table columns
  const columns: ColumnsType<GrpcServiceInfo> = useMemo(
    () => [
      {
        title: 'Service',
        dataIndex: 'name',
        key: 'name',
        sorter: (a, b) => a.name.localeCompare(b.name),
        render: (text: string, record: GrpcServiceInfo) => (
          <Space direction="vertical" size={0}>
            <Space>
              <span style={{ fontWeight: 500 }}>{text}</span>
              <Tag color="blue">{record.package}</Tag>
            </Space>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {record.methods.length} method{record.methods.length !== 1 ? 's' : ''}
            </Text>
          </Space>
        ),
      },
      {
        title: 'Methods',
        dataIndex: 'methods',
        key: 'methods',
        render: (methods: string[], record: GrpcServiceInfo) => {
          // Show only the first few methods with a popover for all methods
          const displayLimit = 3;
          const hasMoreMethods = methods.length > displayLimit;

          return (
            <Popover
              content={() => getMethodsPopover(record)}
              title={`${record.name} Methods`}
              trigger="click"
              placement="right"
            >
              <Space size={[0, 4]} wrap style={{ cursor: 'pointer' }}>
                {methods.slice(0, displayLimit).map((method) => (
                  <Tag key={method} color="geekblue">
                    {method}
                  </Tag>
                ))}
                {hasMoreMethods && <Tag color="default">+{methods.length - displayLimit} more</Tag>}
              </Space>
            </Popover>
          );
        },
      },
      {
        title: 'URL',
        dataIndex: 'url',
        key: 'url',
        render: (text: string) => (
          <Tooltip title="Click to copy URL">
            <div
              style={{
                maxWidth: 250,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
              onClick={() => copyToClipboard(text)}
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
        width: 120,
        sorter: (a, b) => a.status.localeCompare(b.status),
        filters: [
          { text: 'Active', value: 'active' },
          { text: 'Inactive', value: 'inactive' },
        ],
        onFilter: (value, record) => record.status === value,
        render: (status: string) => (
          <Badge
            status={status === 'active' ? 'success' : 'error'}
            text={
              <Tag color={status === 'active' ? 'green' : 'red'}>
                {status === 'active' ? (
                  <Space>
                    <CheckCircleOutlined />
                    {status.toUpperCase()}
                  </Space>
                ) : (
                  <Space>
                    <CloseCircleOutlined />
                    {status.toUpperCase()}
                  </Space>
                )}
              </Tag>
            }
          />
        ),
      },
      {
        title: 'Last Activity',
        dataIndex: 'lastActivity',
        key: 'lastActivity',
        width: 170,
        sorter: (a, b) => {
          const timeA = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
          const timeB = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
          return timeA - timeB;
        },
        render: (date?: string) => (
          <Tooltip title={date ? formatDate(date) : 'No activity recorded'}>
            <div>
              {date ? (
                <>
                  <div>{formatRelativeTime(date)}</div>
                  <div style={{ fontSize: '12px', color: 'rgba(0, 0, 0, 0.45)' }}>
                    {formatDate(date)}
                  </div>
                </>
              ) : (
                <span style={{ color: 'rgba(0, 0, 0, 0.45)' }}>No activity</span>
              )}
            </div>
          </Tooltip>
        ),
      },
      {
        title: 'Action',
        key: 'action',
        fixed: 'right',
        width: 100,
        render: (_: any, record: GrpcServiceInfo) => (
          <Button
            type="primary"
            size="small"
            icon={<InfoCircleOutlined />}
            onClick={() => showServiceDetails(record)}
          >
            Details
          </Button>
        ),
      },
    ],
    [formatDate, formatRelativeTime, showServiceDetails, copyToClipboard, getMethodsPopover],
  );

  return (
    <div className="services-container">
      <div className="table-header-actions">
        <Space direction="vertical" size={0} align="start">
          <Title level={4}>gRPC Services</Title>
          {!socketConnected && (
            <Badge status="warning" text="WebSocket disconnected - using HTTP fallback" />
          )}
        </Space>
        <Space>
          <Search
            placeholder="Search services..."
            allowClear
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 250 }}
          />
          <Tooltip title="Export Services">
            <Button
              icon={<DownloadOutlined />}
              onClick={exportServicesToJson}
              disabled={filteredServices.length === 0}
            >
              Export
            </Button>
          </Tooltip>
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={fetchServices}
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

      {/* Service Stats */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic title="Total Services" value={serviceStats.total} prefix={<ApiOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title="Active Services"
              value={serviceStats.active}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#3f8600' }}
              suffix={`/ ${serviceStats.total}`}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title="Total Methods"
              value={serviceStats.methodsCount}
              prefix={<LinkOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Services Table */}
      <Card bordered={false}>
        <Spin spinning={loading} tip="Loading services...">
          <Table
            dataSource={filteredServices}
            columns={columns}
            rowKey="id"
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} services`,
            }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    loading
                      ? 'Loading services...'
                      : searchText
                        ? 'No services found matching your search'
                        : 'No services available'
                  }
                />
              ),
            }}
            rowClassName={(record) => `service-row ${record.status}-service`}
            scroll={{ x: 'max-content' }}
            sticky
          />
        </Spin>
      </Card>

      {/* Service Details Drawer */}
      <Drawer
        title={
          <Space>
            <span>Service Details</span>
            {selectedService && (
              <Tag color={selectedService.status === 'active' ? 'green' : 'red'}>
                {selectedService.status.toUpperCase()}
              </Tag>
            )}
          </Space>
        }
        placement="right"
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
        width={550}
        extra={<Button onClick={() => setDrawerVisible(false)}>Close</Button>}
      >
        {selectedService && (
          <>
            <Descriptions bordered column={1} labelStyle={{ fontWeight: 'bold' }}>
              <Descriptions.Item label="Service Name">
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <Text>{selectedService.name}</Text>
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => copyToClipboard(selectedService.name)}
                  />
                </div>
              </Descriptions.Item>
              <Descriptions.Item label="Package">
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <Text>{selectedService.package}</Text>
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => copyToClipboard(selectedService.package)}
                  />
                </div>
              </Descriptions.Item>
              <Descriptions.Item label="URL">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    wordBreak: 'break-all',
                  }}
                >
                  <Text>{selectedService.url}</Text>
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => copyToClipboard(selectedService.url)}
                  />
                </div>
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Space align="center">
                  <Badge
                    status={selectedService.status === 'active' ? 'success' : 'error'}
                    text={selectedService.status.toUpperCase()}
                  />
                  {selectedService.status === 'inactive' && (
                    <Text type="secondary">(Service is not responding)</Text>
                  )}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Last Activity">
                {selectedService.lastActivity ? (
                  <>
                    <div>{formatDate(selectedService.lastActivity)}</div>
                    <div style={{ color: 'rgba(0, 0, 0, 0.45)', fontSize: '0.9em' }}>
                      ({formatRelativeTime(selectedService.lastActivity)})
                    </div>
                  </>
                ) : (
                  <Text type="secondary">No activity recorded</Text>
                )}
              </Descriptions.Item>
            </Descriptions>

            <Title level={5} style={{ margin: '24px 0 12px' }}>
              Methods ({selectedService.methods.length})
            </Title>

            <Card size="small" bodyStyle={{ maxHeight: '300px', overflow: 'auto' }}>
              <Space size={[0, 8]} direction="vertical" style={{ width: '100%' }}>
                {selectedService.methods.map((method) => {
                  const methodId = `${selectedService.name}-${method}`;
                  const methodPath = `/${selectedService.package}.${selectedService.name}/${method}`;

                  return (
                    <div
                      key={method}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '4px 0',
                        transition: 'background-color 0.3s',
                        backgroundColor:
                          copiedMethodId === methodId ? 'rgba(82, 196, 26, 0.1)' : 'transparent',
                        borderRadius: '2px',
                      }}
                    >
                      <div>
                        <Tag color="geekblue">{method}</Tag>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          {methodPath}
                        </Text>
                      </div>
                      <Button
                        type="text"
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() =>
                          copyMethod(selectedService.package, selectedService.name, method)
                        }
                      />
                    </div>
                  );
                })}
              </Space>
            </Card>

            {selectedService.status === 'inactive' && (
              <Alert
                message="Service Inactive"
                description="This service is currently inactive and not responding to requests. It may be down, undergoing maintenance, or experiencing issues."
                type="warning"
                showIcon
                style={{ marginTop: 16 }}
                icon={<SyncOutlined spin />}
              />
            )}
          </>
        )}
      </Drawer>
    </div>
  );
};

export default Services;
