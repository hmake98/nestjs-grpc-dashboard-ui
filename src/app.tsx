import React, { useEffect, useState, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, theme, Button, notification } from 'antd';
import {
  AppstoreOutlined,
  ApiOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  BarChartOutlined,
  SettingOutlined,
  DisconnectOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import Dashboard from './pages/Dashboard';
import Services from './pages/Services';
import Connections from './pages/Connections';
import Logs from './pages/Logs';
import Stats from './pages/Stats';
import Settings from './pages/Settings';
import socketService from './services/socket';

const { Header, Content, Sider } = Layout;

// Define routes configuration for cleaner code
const routes = [
  { key: '1', path: '/', icon: <AppstoreOutlined />, label: 'Dashboard', component: <Dashboard /> },
  {
    key: '2',
    path: '/services',
    icon: <ApiOutlined />,
    label: 'Services',
    component: <Services />,
  },
  {
    key: '3',
    path: '/connections',
    icon: <DatabaseOutlined />,
    label: 'Connections',
    component: <Connections />,
  },
  { key: '4', path: '/logs', icon: <FileTextOutlined />, label: 'Logs', component: <Logs /> },
  {
    key: '5',
    path: '/stats',
    icon: <BarChartOutlined />,
    label: 'Statistics',
    component: <Stats />,
  },
  {
    key: '6',
    path: '/settings',
    icon: <SettingOutlined />,
    label: 'Settings',
    component: <Settings />,
  },
];

const App: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [connected, setConnected] = useState(false);

  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  // Determine selected key based on current path - memoized for performance
  const getSelectedKey = useCallback(() => {
    const path = location.pathname.split('/')[1] || 'dashboard';
    const route = routes.find(
      (r) => r.path === `/${path}` || (r.path === '/' && path === 'dashboard'),
    );
    return route?.key || '1';
  }, [location.pathname]);

  // Handle menu item click - memoized
  const handleMenuClick = useCallback(
    (key: string) => {
      const route = routes.find((r) => r.key === key);
      if (route) {
        navigate(route.path);
      }
    },
    [navigate],
  );

  // Toggle WebSocket connection - memoized
  const toggleConnection = useCallback(() => {
    if (connected) {
      socketService.disconnect();
      notification.info({
        message: 'Disconnected',
        description: 'WebSocket connection has been terminated.',
      });
    } else {
      socketService.connect();
      notification.success({
        message: 'Connecting',
        description: 'Attempting to establish WebSocket connection...',
      });
    }
  }, [connected]);

  // Connect to WebSocket on component mount
  useEffect(() => {
    // Set up event listeners
    const connectHandler = () => {
      setConnected(true);
      notification.success({
        message: 'Connected',
        description: 'WebSocket connection established successfully.',
        duration: 3,
      });
    };

    const disconnectHandler = () => {
      setConnected(false);
      notification.warning({
        message: 'Disconnected',
        description: 'WebSocket connection lost. Attempting to reconnect...',
        duration: 4,
      });
    };

    const errorHandler = (error: Error) => {
      notification.error({
        message: 'Connection Error',
        description: `Failed to connect: ${error.message}`,
        duration: 5,
      });
    };

    // Initialize connection
    socketService.connect();

    // Register event handlers
    socketService.on('connect', connectHandler);
    socketService.on('disconnect', disconnectHandler);
    socketService.on('connect_error', errorHandler);

    // Update the connection status on mount
    setConnected(socketService.isConnected());

    // Clean up on unmount
    return () => {
      socketService.off('connect', connectHandler);
      socketService.off('disconnect', disconnectHandler);
      socketService.off('connect_error', errorHandler);
    };
  }, []);

  // Generate menu items from routes configuration
  const menuItems = routes.map((route) => ({
    key: route.key,
    icon: route.icon,
    label: route.label,
    onClick: () => handleMenuClick(route.key),
  }));

  return (
    <Layout>
      <Header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="logo">
          <ApiOutlined className="logo-icon" />
          <span>gRPC Dashboard</span>
        </div>
        <div className="header-right">
          <Button
            type="text"
            size="small"
            onClick={toggleConnection}
            icon={connected ? <CheckCircleOutlined /> : <DisconnectOutlined />}
            style={{ color: 'white' }}
          >
            {connected ? 'Connected' : 'Disconnected'}
          </Button>
        </div>
      </Header>
      <Layout>
        <Sider
          width={200}
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          breakpoint="lg"
          collapsedWidth={80}
        >
          <Menu
            mode="inline"
            selectedKeys={[getSelectedKey()]}
            style={{ height: '100%', borderRight: 0 }}
            items={menuItems}
          />
        </Sider>
        <Layout style={{ padding: '0 24px 24px' }}>
          <Content
            style={{
              padding: 24,
              margin: '16px 0',
              background: colorBgContainer,
              borderRadius: borderRadiusLG,
              minHeight: 280,
              overflow: 'auto',
            }}
          >
            <Routes>
              {routes.map((route) => (
                <Route
                  key={route.key}
                  path={route.path === '/' ? '/' : route.path.slice(1)}
                  element={route.component}
                />
              ))}
            </Routes>
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
};

export default App;
