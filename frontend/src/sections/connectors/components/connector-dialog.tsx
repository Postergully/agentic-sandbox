// components/connector-dialog.tsx

import { useState, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Avatar,
  Chip,
  Button,
  IconButton,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Close as CloseIcon,
  ArrowForward as NextIcon,
} from '@mui/icons-material';
import { RedirectUriSection } from './redirect-uri-section';
import { DocumentationSection } from './documentation-section';
import { AuthFieldsSection } from './auth-fields-section';
import { getConnectorDefinition } from '../data/connector-definitions';
import { connectorApi } from '../services/api';
import type { Connector, ConnectorDefinition } from '../types/types';

interface ConnectorDialogProps {
  open: boolean;
  onClose: () => void;
  connector: Connector | null;
  onSuccess?: () => void;
}

export function ConnectorDialog({
  open,
  onClose,
  connector,
  onSuccess,
}: ConnectorDialogProps) {
  const [authValues, setAuthValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Get connector definition from static data
  const definition: ConnectorDefinition | undefined = useMemo(() => {
    if (!connector) return undefined;
    return getConnectorDefinition(connector.name);
  }, [connector]);

  // Reset form when dialog opens with new connector
  const handleDialogEnter = useCallback(() => {
    setAuthValues({});
    setErrors({});
    setSubmitError(null);
  }, []);

  const handleFieldChange = useCallback((name: string, value: string) => {
    setAuthValues((prev) => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  }, [errors]);

  const validateForm = useCallback((): boolean => {
    if (!definition) return false;

    const newErrors: Record<string, string> = {};

    definition.schema.authFields.forEach((field) => {
      if (field.isRequired && !authValues[field.name]?.trim()) {
        newErrors[field.name] = `${field.displayName} is required`;
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [definition, authValues]);

  const handleNext = async () => {
    if (!connector || !definition) return;

    // Validate form
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Save credentials to backend
      await connectorApi.updateConfig(connector.name, {
        authConfig: authValues,
      });

      // For OAuth connectors, initiate OAuth flow
      if (connector.authType.includes('OAUTH')) {
        const baseUrl = window.location.origin;
        const authUrl = await connectorApi.getOAuthUrl(connector.name, baseUrl);
        window.location.href = authUrl;
      } else {
        // For non-OAuth connectors, just close and refresh
        onSuccess?.();
        onClose();
      }
    } catch (error) {
      console.error('Failed to save configuration:', error);
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Failed to save configuration. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!connector) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      TransitionProps={{
        onEnter: handleDialogEnter,
      }}
    >
      {/* Header */}
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          pb: 1,
        }}
      >
        <Avatar
          src={connector.iconPath}
          alt={connector.name}
          sx={{ width: 48, height: 48 }}
        >
          {connector.name.charAt(0)}
        </Avatar>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h6" component="div">
            Configure {connector.name}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
            <Chip
              label={connector.appGroup}
              size="small"
              variant="outlined"
            />
            <Chip
              label={connector.authType.replace(/_/g, ' ')}
              size="small"
              color="primary"
              variant="outlined"
            />
            {connector.supportsRealtime && (
              <Chip
                label="Real-time"
                size="small"
                color="info"
              />
            )}
          </Box>
        </Box>
        <IconButton
          onClick={onClose}
          size="small"
          sx={{ mt: -0.5, mr: -1 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      {/* Content */}
      <DialogContent dividers>
        {submitError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSubmitError(null)}>
            {submitError}
          </Alert>
        )}

        {/* Redirect URI Section */}
        {definition?.schema.redirectUri && (
          <RedirectUriSection redirectUri={definition.schema.redirectUri} />
        )}

        {/* Documentation Section */}
        {definition?.schema.documentationLinks && (
          <DocumentationSection links={definition.schema.documentationLinks} />
        )}

        {/* Auth Fields Section */}
        {definition?.schema.authFields && (
          <AuthFieldsSection
            fields={definition.schema.authFields}
            values={authValues}
            onChange={handleFieldChange}
            errors={errors}
          />
        )}

        {/* Fallback for connectors without definition */}
        {!definition && (
          <Alert severity="info">
            Configuration schema not available for this connector.
            Please contact support for assistance.
          </Alert>
        )}
      </DialogContent>

      {/* Actions */}
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleNext}
          disabled={isSubmitting || !definition}
          endIcon={
            isSubmitting ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <NextIcon />
            )
          }
        >
          {connector.authType.includes('OAUTH') ? 'Authorize' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
