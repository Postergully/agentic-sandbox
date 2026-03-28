// connectors.tsx

import { useState, useCallback } from 'react';
import {
  Box,
  Grid,
  TextField,
  InputAdornment,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Skeleton,
  Button,
  Alert,
} from '@mui/material';
import { Search as SearchIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import { ConnectorCard } from './components/connector-card';
import { ConnectorDialog } from './components/connector-dialog';
import { useConnectors } from './hooks/use-connectors';
import type { Connector } from './types/types';

type FilterType = 'all' | 'active' | 'configured' | 'not_configured';

export function ConnectorsPage() {
  const { connectors, isLoading, error, refetch } = useConnectors();
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedConnector, setSelectedConnector] = useState<Connector | null>(null);

  const handleOpenDialog = useCallback((connector: Connector) => {
    setSelectedConnector(connector);
    setDialogOpen(true);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
    // Delay clearing connector to prevent UI flash during close animation
    setTimeout(() => setSelectedConnector(null), 200);
  }, []);

  const handleDialogSuccess = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredConnectors = connectors.filter((connector) => {
    // Search filter
    const matchesSearch =
      connector.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      connector.appGroup.toLowerCase().includes(searchQuery.toLowerCase());

    // Status filter
    const matchesFilter =
      filter === 'all' ||
      (filter === 'active' && connector.isActive) ||
      (filter === 'configured' && connector.isConfigured && !connector.isActive) ||
      (filter === 'not_configured' && !connector.isConfigured);

    return matchesSearch && matchesFilter;
  });

  const counts = {
    all: connectors.length,
    active: connectors.filter((c) => c.isActive).length,
    configured: connectors.filter((c) => c.isConfigured).length,
    notConfigured: connectors.filter((c) => !c.isConfigured).length,
  };

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={refetch}>
              Retry
            </Button>
          }
        >
          {error.message}
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h4" fontWeight="bold">
            Data Connectors
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Connect and manage integrations with external services
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={refetch}
          disabled={isLoading}
        >
          Refresh
        </Button>
      </Box>

      {/* Search */}
      <TextField
        fullWidth
        placeholder="Search connectors by name or category..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon />
            </InputAdornment>
          ),
        }}
        sx={{ mb: 3 }}
      />

      {/* Filter Buttons */}
      <Box sx={{ mb: 3, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <ToggleButtonGroup
          value={filter}
          exclusive
          onChange={(_, value) => value && setFilter(value)}
          size="small"
        >
          <ToggleButton value="all">
            All ({counts.all})
          </ToggleButton>
          <ToggleButton value="active">
            Active ({counts.active})
          </ToggleButton>
          <ToggleButton value="configured">
            Configured ({counts.configured})
          </ToggleButton>
          <ToggleButton value="not_configured">
            Not Configured ({counts.notConfigured})
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Connector Grid */}
      <Typography variant="h6" sx={{ mb: 2 }}>
        All Connectors ({filteredConnectors.length})
      </Typography>

      <Grid container spacing={3}>
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={i}>
                <Skeleton variant="rounded" height={280} />
              </Grid>
            ))
          : filteredConnectors.map((connector) => (
              <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={connector._key}>
                <ConnectorCard
                  connector={connector}
                  onConfigure={handleOpenDialog}
                  onUpdate={refetch}
                />
              </Grid>
            ))}
      </Grid>

      {/* Empty State */}
      {!isLoading && filteredConnectors.length === 0 && (
        <Box
          sx={{
            textAlign: 'center',
            py: 8,
            color: 'text.secondary',
          }}
        >
          <Typography variant="h6" gutterBottom>
            No connectors found
          </Typography>
          <Typography variant="body2">
            Try adjusting your search or filter criteria
          </Typography>
        </Box>
      )}

      {/* Configuration Dialog */}
      <ConnectorDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        connector={selectedConnector}
        onSuccess={handleDialogSuccess}
      />
    </Box>
  );
}
