import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Table,
  Typography,
  Tag,
  Space,
  Button,
  Card,
  Select,
  Input,
  Drawer,
  Descriptions,
  Badge,
  Form,
  InputNumber,
  Alert,
  Tooltip,
  Empty,
  Spin,
  Divider,
  Popover,
  notification,
} from 'antd';
import {
  ReloadOutlined,
  InfoCircleOutlined,
  SearchOutlined,
  FilterOutlined,
  ClearOutlined,
  SaveOutlined,
  DownloadOutlined,
  CopyOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { LogEntry, GrpcServiceInfo } from '../types/api';
import { format, formatDistance } from 'date-fns';
import ApiService from '../services/api';
import socketService from '../services/socket';
import { ColumnsType } from 'antd/es/table';
import { debounce } from 'lodash';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

// Log level configuration for consistent styling
const LOG_LEVELS = {
  error: { color: 'red', label: 'ERROR', status: 'error', icon: <WarningOutlined /> },
  warn: { color: 'orange', label: 'WARNING', status: 'warning' },
  info: { color: 'blue', label: 'INFO', status: 'processing' },
  debug: { color: 'purple', label: 'DEBUG', status: 'processing' },
  verbose: { color: 'gray', label: 'VERBOSE', status: 'default' },
};

type LogFilter = {
  levels: string[];
  service?: string;
  searchText: string;
  limit: number;
};

/**
 * Logs component for displaying and filtering gRPC log entries
 */
const Logs: React.FC = () => {
  // State management
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [services, setServices] = useState<GrpcServiceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [refreshInterval, setRefreshInterval] = useState<number | null>(null);
  const [form] = Form.useForm();

  // Filter states
  const [filters, setFilters] = useState<LogFilter>({
    levels: ['error', 'warn', 'info', 'debug', 'verbose'],
    service: undefined,
    searchText: '',
    limit: 50,
  });

  // Save/Load filters from localStorage
  const [savedFilters, setSavedFilters] = useState<Record<string, LogFilter>>({});

  // Load user settings
  useEffect(() => {
    // Load auto-refresh setting
    const savedSettings = localStorage.getItem('grpcDashboardSettings');
    if (savedSettings) {
      try {
        const { refreshInterval, logLevel } = JSON.parse(savedSettings);
        if (refreshInterval > 0) {
          setRefreshInterval(refreshInterval * 1000); // Convert to milliseconds
        }

        // Apply log level filter from settings if available
        if (logLevel) {
          const levelIndex = Object.keys(LOG_LEVELS).indexOf(logLevel);
          if (levelIndex >= 0) {
            const levels = Object.keys(LOG_LEVELS).slice(0, levelIndex + 1);
            setFilters((prev) => ({ ...prev, levels }));
            form.setFieldsValue({ levels });
          }
        }
      } catch (error) {
        console.error('Failed to parse saved settings:', error);
      }
    }

    // Load saved filters
    const savedFiltersJson = localStorage.getItem('grpcDashboardLogFilters');
    if (savedFiltersJson) {
      try {
        setSavedFilters(JSON.parse(savedFiltersJson));
      } catch (error) {
        console.error('Failed to parse saved filters:', error);
      }
    }
  }, [form]);

  // Fetch logs data with applied filters
  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await ApiService.getLogs({
        levels: filters.levels,
        service: filters.service,
        limit: filters.limit,
      });
      setLogs(data);
    } catch (error) {
      console.error('Error fetching logs:', error);
      setError('Failed to fetch logs. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Fetch services for the filter dropdown
  const fetchServices = useCallback(async () => {
    try {
      const data = await ApiService.getServices();
      setServices(data);
    } catch (error) {
      console.error('Error fetching services:', error);
    }
  }, []);

  // Handle log updates from WebSocket
  const handleLogUpdate = useCallback(
    (log: LogEntry) => {
      // Only add the log if it matches the current filters
      if (
        filters.levels.includes(log.level) &&
        (!filters.service || (log.service && log.service === filters.service)) &&
        (!filters.searchText ||
          log.message.toLowerCase().includes(filters.searchText.toLowerCase()) ||
          log.context.toLowerCase().includes(filters.searchText.toLowerCase()) ||
          (log.service && log.service.toLowerCase().includes(filters.searchText.toLowerCase())) ||
          (log.method && log.method.toLowerCase().includes(filters.searchText.toLowerCase())))
      ) {
        setLogs((prev) => [log, ...prev.slice(0, filters.limit - 1)]);
      }
    },
    [filters],
  );

  // Set up WebSocket listeners and fetch data on component mount
  useEffect(() => {
    fetchLogs();
    fetchServices();

    // Register socket event handler for new logs
    const unsubscribeLog = socketService.on('log', handleLogUpdate);

    // Request initial logs from WebSocket
    if (socketService.isConnected()) {
      socketService.getLogs({
        levels: filters.levels,
        service: filters.service,
        limit: filters.limit,
      });
    }

    // Auto-refresh setup
    let intervalId: number | undefined;
    if (refreshInterval) {
      intervalId = window.setInterval(() => {
        fetchLogs();
      }, refreshInterval);
    }

    // Clean up on unmount
    return () => {
      unsubscribeLog();
      if (intervalId) clearInterval(intervalId);
      ApiService.abortAllRequests(); // Abort any pending fetch requests
    };
  }, [fetchLogs, fetchServices, handleLogUpdate, filters, refreshInterval]);

  // Show log details
  const showLogDetails = useCallback((log: LogEntry) => {
    setSelectedLog(log);
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

  // Format relative time
  const formatRelativeTime = useCallback((dateStr: string) => {
    try {
      return formatDistance(new Date(dateStr), new Date(), { addSuffix: true });
    } catch (e) {
      return dateStr;
    }
  }, []);

  // Apply filters and refresh logs
  const applyFilters = useCallback(() => {
    const values = form.getFieldsValue();
    setFilters({
      levels: values.levels,
      service: values.service,
      searchText: values.searchText || '',
      limit: values.limit,
    });
  }, [form]);

  // Debounced search handler
  const debouncedSearch = useMemo(
    () =>
      debounce((value: string) => {
        setFilters((prev) => ({ ...prev, searchText: value }));
      }, 500),
    [],
  );

  // Handle search input change
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      form.setFieldsValue({ searchText: value });
      debouncedSearch(value);
    },
    [form, debouncedSearch],
  );

  // Reset filters to default
  const resetFilters = useCallback(() => {
    const defaultFilters = {
      levels: ['error', 'warn', 'info', 'debug', 'verbose'],
      service: undefined,
      searchText: '',
      limit: 50,
    };

    setFilters(defaultFilters);
    form.setFieldsValue(defaultFilters);
  }, [form]);

  // Save current filters
  const saveCurrentFilters = useCallback(() => {
    const filterName = prompt('Enter a name for these filters:');
    if (filterName) {
      const newSavedFilters = {
        ...savedFilters,
        [filterName]: { ...filters },
      };

      setSavedFilters(newSavedFilters);
      localStorage.setItem('grpcDashboardLogFilters', JSON.stringify(newSavedFilters));

      notification.success({
        message: 'Filters Saved',
        description: `Filter set "${filterName}" has been saved.`,
      });
    }
  }, [filters, savedFilters]);

  // Load saved filter
  const loadSavedFilter = useCallback(
    (filterName: string) => {
      const filterToLoad = savedFilters[filterName];
      if (filterToLoad) {
        setFilters(filterToLoad);
        form.setFieldsValue(filterToLoad);

        notification.info({
          message: 'Filters Loaded',
          description: `Filter set "${filterName}" has been applied.`,
        });
      }
    },
    [savedFilters, form],
  );

  // Delete saved filter
  const deleteSavedFilter = useCallback(
    (filterName: string) => {
      const { [filterName]: _, ...remainingFilters } = savedFilters;
      setSavedFilters(remainingFilters);
      localStorage.setItem('grpcDashboardLogFilters', JSON.stringify(remainingFilters));

      notification.info({
        message: 'Filters Deleted',
        description: `Filter set "${filterName}" has been deleted.`,
      });
    },
    [savedFilters],
  );

  const filteredLogs = useMemo(() => {
    if (!filters.searchText) {
      return logs;
    }

    return logs.filter(
      (log) =>
        log.message.toLowerCase().includes(filters.searchText.toLowerCase()) ||
        log.context.toLowerCase().includes(filters.searchText.toLowerCase()) ||
        (log.service && log.service.toLowerCase().includes(filters.searchText.toLowerCase())) ||
        (log.method && log.method.toLowerCase().includes(filters.searchText.toLowerCase())) ||
        (log.traceId && log.traceId.toLowerCase().includes(filters.searchText.toLowerCase())),
    );
  }, [logs, filters.searchText]);

  // Export logs to JSON
  const exportLogsToJson = useCallback(() => {
    try {
      const dataStr = JSON.stringify(filteredLogs, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

      const exportFileDefaultName = `grpc-logs-${new Date().toISOString().slice(0, 10)}.json`;

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();

      notification.success({
        message: 'Export Successful',
        description: `${filteredLogs.length} logs exported to JSON.`,
      });
    } catch (error) {
      console.error('Error exporting logs:', error);
      notification.error({
        message: 'Export Failed',
        description: 'Failed to export logs to JSON.',
      });
    }
  }, [filteredLogs]);

  // Copy log details to clipboard
  const copyLogToClipboard = useCallback(
    (log: LogEntry) => {
      const logText = `
Time: ${formatDate(log.timestamp)}
Level: ${log.level.toUpperCase()}
Context: ${log.context}
Message: ${log.message}
${log.service ? `Service: ${log.service}` : ''}
${log.method ? `Method: ${log.method}` : ''}
${log.traceId ? `Trace ID: ${log.traceId}` : ''}
    `.trim();

      navigator.clipboard.writeText(logText).then(
        () => {
          notification.success({
            message: 'Copied',
            description: 'Log details copied to clipboard',
            duration: 2,
          });
        },
        (err) => {
          console.error('Could not copy text: ', err);
        },
      );
    },
    [formatDate],
  );

  // Table columns
  const columns: ColumnsType<LogEntry> = useMemo(
    () => [
      {
        title: 'Time',
        dataIndex: 'timestamp',
        key: 'timestamp',
        width: 180,
        render: (timestamp: string) => (
          <Tooltip title={formatDate(timestamp)}>
            <div>
              <div>{formatDate(timestamp)}</div>
              <div style={{ fontSize: '12px', color: 'rgba(0, 0, 0, 0.45)' }}>
                {formatRelativeTime(timestamp)}
              </div>
            </div>
          </Tooltip>
        ),
        sorter: (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        defaultSortOrder: 'descend',
      },
      {
        title: 'Level',
        dataIndex: 'level',
        key: 'level',
        width: 100,
        render: (level: string) => {
          const logLevel = LOG_LEVELS[level as keyof typeof LOG_LEVELS] || {
            color: 'default',
            label: level.toUpperCase(),
          };
          return <Tag color={logLevel.color}>{logLevel.label}</Tag>;
        },
        filters: Object.entries(LOG_LEVELS).map(([key, value]) => ({
          text: <Badge status={value.status as any} text={value.label} />,
          value: key,
        })),
        onFilter: (value, record) => record.level === value,
      },
      {
        title: 'Context',
        dataIndex: 'context',
        key: 'context',
        width: 150,
        render: (context: string) => <Tag>{context}</Tag>,
        filters: Array.from(new Set(logs.map((log) => log.context))).map((context) => ({
          text: context,
          value: context,
        })),
        onFilter: (value, record) => record.context === value,
      },
      {
        title: 'Message',
        dataIndex: 'message',
        key: 'message',
        render: (message: string, record: LogEntry) => (
          <div>
            <div style={{ wordBreak: 'break-word' }}>{message}</div>
            {(record.service || record.method || record.traceId) && (
              <div style={{ marginTop: 5 }}>
                {record.service && (
                  <Tooltip title="Service">
                    <Tag color="blue">{record.service}</Tag>
                  </Tooltip>
                )}
                {record.method && (
                  <Tooltip title="Method">
                    <Tag color="geekblue">{record.method}</Tag>
                  </Tooltip>
                )}
                {record.traceId && (
                  <Tooltip title="Trace ID">
                    <Tag color="cyan">Trace: {record.traceId}</Tag>
                  </Tooltip>
                )}
              </div>
            )}
          </div>
        ),
      },
      {
        title: 'Action',
        key: 'action',
        width: 100,
        fixed: 'right',
        render: (_, record: LogEntry) => (
          <Space>
            <Tooltip title="View Details">
              <Button
                type="text"
                icon={<InfoCircleOutlined />}
                onClick={() => showLogDetails(record)}
              />
            </Tooltip>
            <Tooltip title="Copy to Clipboard">
              <Button
                type="text"
                icon={<CopyOutlined />}
                onClick={() => copyLogToClipboard(record)}
              />
            </Tooltip>
          </Space>
        ),
      },
    ],
    [logs, showLogDetails, formatDate, formatRelativeTime, copyLogToClipboard],
  );

  // Render saved filters menu
  const renderSavedFiltersMenu = useMemo(() => {
    const savedFilterNames = Object.keys(savedFilters);

    if (savedFilterNames.length === 0) {
      return (
        <div style={{ padding: '8px 12px' }}>
          <Text type="secondary">No saved filters</Text>
        </div>
      );
    }

    return (
      <div style={{ maxWidth: 250 }}>
        {savedFilterNames.map((name) => (
          <div
            key={name}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '4px 0',
            }}
          >
            <Button
              type="link"
              onClick={() => loadSavedFilter(name)}
              style={{ textAlign: 'left', padding: '0 8px' }}
            >
              {name}
            </Button>
            <Button
              type="text"
              danger
              size="small"
              onClick={() => deleteSavedFilter(name)}
              icon={<ClearOutlined />}
            />
          </div>
        ))}
      </div>
    );
  }, [savedFilters, loadSavedFilter, deleteSavedFilter]);

  // Count logs by level
  const logCounts = useMemo(() => {
    // Define filteredLogs reference for this function
    const logsToCount = !filters.searchText
      ? logs
      : logs.filter(
          (log) =>
            log.message.toLowerCase().includes(filters.searchText.toLowerCase()) ||
            log.context.toLowerCase().includes(filters.searchText.toLowerCase()) ||
            (log.service && log.service.toLowerCase().includes(filters.searchText.toLowerCase())) ||
            (log.method && log.method.toLowerCase().includes(filters.searchText.toLowerCase())) ||
            (log.traceId && log.traceId.toLowerCase().includes(filters.searchText.toLowerCase())),
        );

    const counts = {
      error: 0,
      warn: 0,
      info: 0,
      debug: 0,
      verbose: 0,
      total: logsToCount.length,
    };

    logsToCount.forEach((log) => {
      if (counts.hasOwnProperty(log.level)) {
        counts[log.level as keyof typeof counts]++;
      }
    });

    return counts;
  }, [logs, filters.searchText]);

  return (
    <div className="logs-container">
      <div className="table-header-actions">
        <Title level={4}>gRPC Logs</Title>
        <Space>
          <Tooltip title="Export Logs">
            <Button
              icon={<DownloadOutlined />}
              onClick={exportLogsToJson}
              disabled={filteredLogs.length === 0}
            >
              Export
            </Button>
          </Tooltip>
          <Button type="primary" icon={<ReloadOutlined />} onClick={fetchLogs} loading={loading}>
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

      {/* Filters */}
      <Card className="filter-container">
        <Form
          form={form}
          layout="inline"
          initialValues={filters}
          onFinish={applyFilters}
          style={{ flexWrap: 'wrap', gap: '8px' }}
        >
          <Form.Item label="Log Level" name="levels">
            <Select
              mode="multiple"
              allowClear
              style={{ width: 320 }}
              placeholder="Filter by log level"
            >
              {Object.entries(LOG_LEVELS).map(([key, value]) => (
                <Option key={key} value={key}>
                  <Badge status={value.status as any} text={value.label} />
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item label="Service" name="service">
            <Select
              allowClear
              style={{ width: 200 }}
              placeholder="Filter by service"
              loading={services.length === 0}
            >
              {services.map((service) => (
                <Option key={service.id} value={service.name}>
                  {service.name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item label="Limit" name="limit">
            <InputNumber min={1} max={1000} style={{ width: 80 }} />
          </Form.Item>

          <Form.Item name="searchText">
            <Input
              placeholder="Search in logs"
              prefix={<SearchOutlined />}
              onChange={handleSearchChange}
              style={{ width: 200 }}
              allowClear
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" icon={<FilterOutlined />} htmlType="submit">
                Apply Filters
              </Button>
              <Button onClick={resetFilters} icon={<ClearOutlined />}>
                Reset
              </Button>
              <Popover
                title="Saved Filters"
                content={renderSavedFiltersMenu}
                trigger="click"
                placement="bottomRight"
                overlayStyle={{ maxWidth: 300 }}
              >
                <Button icon={<SaveOutlined />}>Saved Filters</Button>
              </Popover>
              <Button type="dashed" onClick={saveCurrentFilters} icon={<SaveOutlined />}>
                Save Current
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {/* Logs Table */}
      <Card bordered={false}>
        <div
          style={{
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Space size="large">
            <Text strong>Total: {logCounts.total}</Text>
            <Tag color={LOG_LEVELS.error.color}>Errors: {logCounts.error}</Tag>
            <Tag color={LOG_LEVELS.warn.color}>Warnings: {logCounts.warn}</Tag>
            <Tag color={LOG_LEVELS.info.color}>Info: {logCounts.info}</Tag>
            {filters.levels.includes('debug') && (
              <Tag color={LOG_LEVELS.debug.color}>Debug: {logCounts.debug}</Tag>
            )}
            {filters.levels.includes('verbose') && (
              <Tag color={LOG_LEVELS.verbose.color}>Verbose: {logCounts.verbose}</Tag>
            )}
          </Space>
          <Space>
            <Text type="secondary">
              {socketService.isConnected()
                ? 'WebSocket connected - receiving real-time logs'
                : 'WebSocket disconnected - only showing fetched logs'}
            </Text>
          </Space>
        </div>

        <Spin spinning={loading} tip="Loading logs...">
          <Table
            dataSource={filteredLogs}
            columns={columns}
            rowKey="id"
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} logs`,
            }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={loading ? 'Loading logs...' : 'No logs found matching your filters'}
                />
              ),
            }}
            scroll={{ x: 'max-content' }}
            rowClassName={(record) => `log-row log-level-${record.level}`}
            sticky
          />
        </Spin>
      </Card>

      {/* Log Details Drawer */}
      <Drawer
        title={
          <Space>
            <span>Log Details</span>
            {selectedLog && (
              <Tag
                color={LOG_LEVELS[selectedLog.level as keyof typeof LOG_LEVELS]?.color || 'default'}
              >
                {selectedLog.level.toUpperCase()}
              </Tag>
            )}
          </Space>
        }
        placement="right"
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
        width={600}
        extra={
          selectedLog && (
            <Space>
              <Button icon={<CopyOutlined />} onClick={() => copyLogToClipboard(selectedLog)}>
                Copy
              </Button>
              <Button onClick={() => setDrawerVisible(false)}>Close</Button>
            </Space>
          )
        }
      >
        {selectedLog && (
          <>
            <Descriptions bordered column={1} labelStyle={{ fontWeight: 'bold' }}>
              <Descriptions.Item label="Timestamp">
                <div>{formatDate(selectedLog.timestamp)}</div>
                <div style={{ color: 'rgba(0, 0, 0, 0.45)', fontSize: '0.9em' }}>
                  ({formatRelativeTime(selectedLog.timestamp)})
                </div>
              </Descriptions.Item>
              <Descriptions.Item label="Level">
                <Tag
                  color={
                    LOG_LEVELS[selectedLog.level as keyof typeof LOG_LEVELS]?.color || 'default'
                  }
                >
                  {selectedLog.level.toUpperCase()}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Context">
                <Tag>{selectedLog.context}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Message">
                <Paragraph style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} copyable>
                  {selectedLog.message}
                </Paragraph>
              </Descriptions.Item>
            </Descriptions>

            {(selectedLog.service || selectedLog.method || selectedLog.traceId) && (
              <>
                <Divider orientation="left">Additional Information</Divider>
                <Descriptions bordered column={1}>
                  {selectedLog.service && (
                    <Descriptions.Item label="Service">
                      <Tag color="blue">{selectedLog.service}</Tag>
                    </Descriptions.Item>
                  )}
                  {selectedLog.method && (
                    <Descriptions.Item label="Method">
                      <Tag color="geekblue">{selectedLog.method}</Tag>
                    </Descriptions.Item>
                  )}
                  {selectedLog.traceId && (
                    <Descriptions.Item label="Trace ID">
                      <Paragraph copyable>{selectedLog.traceId}</Paragraph>
                    </Descriptions.Item>
                  )}
                </Descriptions>
              </>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
};

export default Logs;
