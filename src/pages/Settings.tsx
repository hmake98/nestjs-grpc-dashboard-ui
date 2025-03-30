import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Form,
  Select,
  Switch,
  Button,
  Input,
  Typography,
  message,
  Space,
  Divider,
  Alert,
  Tooltip,
  Badge,
  Row,
  Col,
  Modal,
} from 'antd';
import {
  SaveOutlined,
  ReloadOutlined,
  QuestionCircleOutlined,
  ClearOutlined,
  ExportOutlined,
  ImportOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { LogLevel } from '../types/api';
import socketService from '../services/socket';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { confirm } = Modal;

interface SettingsState {
  logLevel: LogLevel;
  refreshInterval: number;
  darkMode: boolean;
  socketUrl: string;
}

/**
 * Settings component for managing application preferences
 */
const Settings: React.FC = () => {
  const [settings, setSettings] = useState<SettingsState>({
    logLevel: 'info',
    refreshInterval: 5,
    darkMode: false,
    socketUrl: window.location.origin,
  });
  const [form] = Form.useForm();
  const [connected, setConnected] = useState(socketService.isConnected());
  const [settingsChanged, setSettingsChanged] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Initialize settings from localStorage
  useEffect(() => {
    loadSettings();

    // Set up socket connection listener
    const connectHandler = () => setConnected(true);
    const disconnectHandler = () => setConnected(false);

    socketService.on('connect', connectHandler);
    socketService.on('disconnect', disconnectHandler);

    return () => {
      socketService.off('connect', connectHandler);
      socketService.off('disconnect', disconnectHandler);
    };
  }, []);

  // Load settings from localStorage
  const loadSettings = useCallback(() => {
    const savedSettings = localStorage.getItem('grpcDashboardSettings');
    if (savedSettings) {
      try {
        const parsedSettings = JSON.parse(savedSettings);
        setSettings((prevSettings) => ({
          ...prevSettings,
          ...parsedSettings,
        }));
        form.setFieldsValue(parsedSettings);
        setSettingsChanged(false);
      } catch (error) {
        console.error('Failed to parse saved settings:', error);
        message.error('Failed to load settings. Using defaults.');
      }
    }
  }, [form]);

  // Save settings to localStorage
  const saveSettings = useCallback(
    (values: SettingsState) => {
      try {
        localStorage.setItem('grpcDashboardSettings', JSON.stringify(values));
        setSettings(values);
        setSettingsChanged(false);
        message.success('Settings saved successfully');

        // Apply theme if changed
        if (values.darkMode !== settings.darkMode) {
          const htmlElement = document.querySelector('html');
          if (htmlElement) {
            htmlElement.dataset.theme = values.darkMode ? 'dark' : 'light';
          }
          message.info('Theme change will take effect on next reload');
        }
      } catch (error) {
        console.error('Failed to save settings:', error);
        message.error('Failed to save settings');
      }
    },
    [settings],
  );

  // Handle form field changes
  const handleFormChange = useCallback(() => {
    setSettingsChanged(true);
  }, []);

  // Reset settings to defaults
  const resetSettings = useCallback(() => {
    confirm({
      title: 'Reset all settings?',
      icon: <WarningOutlined />,
      content:
        'This will reset all settings to their default values. This action cannot be undone.',
      onOk() {
        const defaultSettings = {
          logLevel: 'info' as LogLevel,
          refreshInterval: 5,
          darkMode: false,
          socketUrl: window.location.origin,
        };

        form.setFieldsValue(defaultSettings);
        localStorage.removeItem('grpcDashboardSettings');
        setSettings(defaultSettings);
        setSettingsChanged(false);
        message.success('Settings reset to defaults');
      },
    });
  }, [form]);

  // Reconnect socket with new URL
  const reconnectSocket = useCallback(() => {
    try {
      const url = form.getFieldValue('socketUrl');
      socketService.disconnect();
      socketService.connect(url);
      message.success('Socket reconnected');
    } catch (error) {
      console.error('Failed to reconnect socket:', error);
      message.error('Failed to reconnect socket');
    }
  }, [form]);

  // Export settings to JSON file
  const exportSettings = useCallback(() => {
    try {
      const dataStr = JSON.stringify(settings, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

      const exportFileDefaultName = 'grpc-dashboard-settings.json';

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();

      message.success('Settings exported successfully');
    } catch (error) {
      console.error('Error exporting settings:', error);
      message.error('Failed to export settings');
    }
  }, [settings]);

  // Import settings from JSON file
  const importSettings = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setImportError(null);
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const importedSettings = JSON.parse(content);

          // Validate imported settings
          if (
            !importedSettings.logLevel ||
            importedSettings.refreshInterval === undefined ||
            importedSettings.darkMode === undefined ||
            !importedSettings.socketUrl
          ) {
            throw new Error('Invalid settings format');
          }

          // Apply imported settings
          form.setFieldsValue(importedSettings);
          setSettingsChanged(true);
          message.success('Settings imported successfully. Click Save to apply.');
        } catch (error) {
          console.error('Failed to import settings:', error);
          setImportError('Failed to import settings. Invalid file format.');
        }
      };
      reader.readAsText(file);

      // Reset file input
      e.target.value = '';
    },
    [form],
  );

  return (
    <div className="settings-container">
      <div className="page-header">
        <Title level={4}>Dashboard Settings</Title>
        <Space>
          {settingsChanged && (
            <Alert
              message="You have unsaved changes"
              type="warning"
              showIcon
              banner
              style={{ marginBottom: 0 }}
            />
          )}
        </Space>
      </div>

      <Card bordered={false}>
        <Form
          form={form}
          layout="vertical"
          initialValues={settings}
          onFinish={saveSettings}
          onValuesChange={handleFormChange}
        >
          <Row gutter={24}>
            <Col span={24} md={12} lg={16}>
              <Title level={5}>Logging</Title>
              <Form.Item
                name="logLevel"
                label={
                  <Space>
                    <span>Log Level</span>
                    <Tooltip title="Only logs of this level and higher priority will be displayed in the logs view">
                      <QuestionCircleOutlined />
                    </Tooltip>
                  </Space>
                }
                help="Minimum log level to display in the logs view"
              >
                <Select>
                  <Option value="error">
                    <Badge status="error" text="Error (Only Errors)" />
                  </Option>
                  <Option value="warn">
                    <Badge status="warning" text="Warning (Warnings & Errors)" />
                  </Option>
                  <Option value="info">
                    <Badge status="processing" text="Info (Information, Warnings & Errors)" />
                  </Option>
                  <Option value="debug">
                    <Badge status="default" text="Debug (Debug, Info, Warnings & Errors)" />
                  </Option>
                  <Option value="verbose">
                    <Badge status="default" text="Verbose (All Logs)" />
                  </Option>
                </Select>
              </Form.Item>

              <Divider />
              <Title level={5}>Dashboard Preferences</Title>

              <Form.Item
                name="refreshInterval"
                label={
                  <Space>
                    <span>Auto Refresh Interval</span>
                    <Tooltip title="How frequently dashboard data will be automatically refreshed">
                      <QuestionCircleOutlined />
                    </Tooltip>
                  </Space>
                }
                help="How often to automatically refresh data (0 to disable)"
              >
                <Select>
                  <Option value={0}>Disabled</Option>
                  <Option value={2}>2 seconds</Option>
                  <Option value={5}>5 seconds</Option>
                  <Option value={10}>10 seconds</Option>
                  <Option value={30}>30 seconds</Option>
                  <Option value={60}>60 seconds</Option>
                  <Option value={300}>5 minutes</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="darkMode"
                label={
                  <Space>
                    <span>Dark Mode</span>
                    <Tooltip title="Change the application theme to dark mode">
                      <QuestionCircleOutlined />
                    </Tooltip>
                  </Space>
                }
                valuePropName="checked"
                help="Enable dark mode for the dashboard (requires page reload)"
              >
                <Switch />
              </Form.Item>

              <Divider />
              <Title level={5}>Connection Settings</Title>

              <Form.Item
                name="socketUrl"
                label="WebSocket Server URL"
                help="The URL of the gRPC dashboard WebSocket server"
                rules={[
                  { required: true, message: 'Please enter a valid URL' },
                  { type: 'url', message: 'Please enter a valid URL' },
                ]}
              >
                <Input
                  placeholder="http://localhost:3000"
                  addonAfter={
                    <Tooltip title="Reconnect to WebSocket server">
                      <ReloadOutlined onClick={reconnectSocket} style={{ cursor: 'pointer' }} />
                    </Tooltip>
                  }
                />
              </Form.Item>
            </Col>

            <Col span={24} md={12} lg={8}>
              <Card title="Connection Status" size="small" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
                  <Badge
                    status={connected ? 'success' : 'error'}
                    text={<Text strong={true}>{connected ? 'Connected' : 'Disconnected'}</Text>}
                  />
                </div>
                <Paragraph>
                  {connected
                    ? 'WebSocket connection established. Real-time updates are enabled.'
                    : 'WebSocket connection not established. Real-time updates are disabled.'}
                </Paragraph>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={reconnectSocket}
                  type={connected ? 'default' : 'primary'}
                  size="small"
                >
                  {connected ? 'Reconnect' : 'Connect Now'}
                </Button>
              </Card>

              <Card title="Settings Management" size="small">
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Paragraph>
                    You can export your current settings to a file and import them later or on
                    another device.
                  </Paragraph>
                  <Space>
                    <Button icon={<ExportOutlined />} onClick={exportSettings}>
                      Export Settings
                    </Button>
                    <Tooltip title="Import settings from JSON file">
                      <Button icon={<ImportOutlined />}>
                        Import Settings
                        <input
                          type="file"
                          accept=".json"
                          onChange={importSettings}
                          style={{
                            opacity: 0,
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            width: '100%',
                            height: '100%',
                            cursor: 'pointer',
                          }}
                        />
                      </Button>
                    </Tooltip>
                  </Space>
                  {importError && (
                    <Alert
                      message={importError}
                      type="error"
                      showIcon
                      closable
                      onClose={() => setImportError(null)}
                    />
                  )}
                </Space>
              </Card>
            </Col>
          </Row>

          <Divider />

          <Form.Item>
            <Space>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={() => form.submit()}
                disabled={!settingsChanged}
              >
                Save Settings
              </Button>
              <Button icon={<ClearOutlined />} onClick={resetSettings} danger>
                Reset to Defaults
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default Settings;
