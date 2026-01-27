// components/connector-card.tsx

import {
  Card,
  CardContent,
  CardActions,
  Box,
  Typography,
  Chip,
  Button,
  Avatar,
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Add as AddIcon,
  Check as CheckIcon,
} from '@mui/icons-material';
import type { Connector } from '../types/types';

interface ConnectorCardProps {
  connector: Connector;
  onConfigure?: (connector: Connector) => void;
  onUpdate?: () => void;
}

export function ConnectorCard({ connector, onConfigure }: ConnectorCardProps) {
  const getStatusColor = (): 'success' | 'warning' | 'default' => {
    if (connector.isActive) return 'success';
    if (connector.isConfigured) return 'warning';
    return 'default';
  };

  const getStatusLabel = () => {
    if (connector.isActive) return 'Active';
    if (connector.isConfigured) return 'Configured';
    return 'Setup Required';
  };

  const handleConfigure = () => {
    onConfigure?.(connector);
  };

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 240,
        border: connector.isActive ? '2px solid' : '1px solid',
        borderColor: connector.isActive ? 'success.main' : 'divider',
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          boxShadow: 4,
          transform: 'translateY(-2px)',
        },
      }}
    >
      <CardContent sx={{ flexGrow: 1, textAlign: 'center', pt: 3 }}>
        {/* Icon */}
        <Avatar
          src={connector.iconPath}
          alt={connector.name}
          sx={{ width: 56, height: 56, mx: 'auto', mb: 2 }}
        >
          {connector.name.charAt(0)}
        </Avatar>

        {/* Name & Group */}
        <Typography variant="h6" fontWeight="bold" gutterBottom>
          {connector.name}
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {connector.appGroup}
        </Typography>

        {/* Status Badge */}
        <Chip
          label={getStatusLabel()}
          color={getStatusColor()}
          size="small"
          icon={connector.isActive ? <CheckIcon /> : <SettingsIcon />}
          sx={{ mt: 1 }}
        />

        {/* Auth Type Tag */}
        <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 0.5 }}>
          <Chip
            label={connector.authType.replace(/_/g, ' ')}
            variant="outlined"
            size="small"
          />
          {connector.supportsRealtime && (
            <Chip
              label="Real-time"
              color="info"
              size="small"
            />
          )}
        </Box>

        {/* Status Indicators */}
        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                flexShrink: 0,
                bgcolor: connector.isConfigured ? 'success.main' : 'grey.400',
              }}
            />
            <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
              {connector.isConfigured ? 'Configured' : 'Not configured'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                flexShrink: 0,
                bgcolor: connector.isActive ? 'success.main' : 'grey.400',
              }}
            />
            <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
              {connector.isActive ? 'Active' : 'Inactive'}
            </Typography>
          </Box>
        </Box>
      </CardContent>

      <CardActions sx={{ justifyContent: 'center', pb: 2, px: 2 }}>
        <Button
          variant="outlined"
          color="primary"
          startIcon={connector.isConfigured ? <SettingsIcon /> : <AddIcon />}
          onClick={handleConfigure}
          sx={{ width: '100%' }}
        >
          {connector.isConfigured ? 'Manage' : 'Configure'}
        </Button>
      </CardActions>
    </Card>
  );
}
