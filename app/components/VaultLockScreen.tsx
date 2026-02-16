import React, { useState } from 'react';
import { Box, Typography, TextField, Button, Dialog, DialogContent, InputAdornment, IconButton, CircularProgress, Alert } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import KeyIcon from '@mui/icons-material/Key';
import CloseIcon from '@mui/icons-material/Close';
import { styled } from '@mui/material/styles';
import { useStatus } from '../context/StatusContext';

const GlowSphere = styled(Box)(({ color }: { color: string }) => ({
    position: 'absolute',
    width: '300px',
    height: '300px',
    background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
    filter: 'blur(60px)',
    zIndex: -1,
    opacity: 0.4,
}));

const StyledDialog = styled(Dialog)({
    '& .MuiPaper-root': {
        borderRadius: '24px',
        background: 'rgba(30, 41, 59, 0.9)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden',
        maxWidth: '450px',
        width: '100%',
    }
});

const VaultLockScreen: React.FC = () => {
    const { unlockVault, initializeVault, migrateVault, unlockWithPasskey, startPasskeyRegistration, isVaultInitialized, needsMigration, isVaultModalOpen, setIsVaultModalOpen } = useStatus();
    const [passphrase, setPassphrase] = useState('');
    const [confirmPassphrase, setConfirmPassphrase] = useState('');
    const [showPassphrase, setShowPassphrase] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPasskeySetup, setShowPasskeySetup] = useState(false);

    const handleClose = () => {
        if (!loading) {
            setIsVaultModalOpen(false);
            setError(null);
            setPassphrase('');
            setConfirmPassphrase('');
            setShowPasskeySetup(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!passphrase) return;

        if (!isVaultInitialized && passphrase !== confirmPassphrase) {
            setError('Passphrases do not match');
            return;
        }

        if (!isVaultInitialized && passphrase.length < 8) {
            setError('Passphrase must be at least 8 characters long');
            return;
        }

        setLoading(true);
        setError(null);

        let result;
        const isActionInitOrMigrate = isInit || isMigrate;

        if (needsMigration) {
            result = await migrateVault(passphrase);
        } else if (isVaultInitialized) {
            result = await unlockVault(passphrase);
        } else {
            result = await initializeVault(passphrase);
        }

        if (!result.success) {
            setError(result.error || 'Failed to process request');
            setLoading(false);
        } else {
            setLoading(false);
            if (isActionInitOrMigrate) {
                setShowPasskeySetup(true);
            } else {
                setIsVaultModalOpen(false);
                setPassphrase('');
                setConfirmPassphrase('');
            }
        }
    };

    // Determine mode: migrate > init > unlock
    const isMigrate = needsMigration;
    const isInit = !isVaultInitialized && !needsMigration;

    return (
        <StyledDialog
            open={isVaultModalOpen || false}
            onClose={handleClose}
            fullWidth
        >
            <Box sx={{ position: 'relative', overflow: 'hidden' }}>
                <GlowSphere color="rgba(99, 102, 241, 0.3)" sx={{ top: '-150px', left: '-150px' }} />
                <GlowSphere color="rgba(236, 72, 153, 0.2)" sx={{ bottom: '-150px', right: '-150px' }} />

                <IconButton
                    onClick={handleClose}
                    disabled={loading}
                    sx={{ position: 'absolute', right: 16, top: 16, color: '#94a3b8', zIndex: 10 }}
                >
                    <CloseIcon />
                </IconButton>

                <DialogContent sx={{ p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#fff', position: 'relative', zIndex: 1 }}>
                    {showPasskeySetup ? (
                        <>
                            <Box sx={{
                                p: 2,
                                borderRadius: '50%',
                                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                mb: 3,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <FingerprintIcon sx={{ fontSize: '48px', color: '#10b981' }} />
                            </Box>

                            <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, textAlign: 'center' }}>
                                Enable Biometric?
                            </Typography>

                            <Typography variant="body1" sx={{ color: '#94a3b8', mb: 4, textAlign: 'center' }}>
                                Unlock your vault instantly with TouchID or FaceID next time. No need to type your passphrase.
                            </Typography>

                            <Button
                                fullWidth
                                variant="contained"
                                onClick={async () => {
                                    setLoading(true);
                                    const result = await startPasskeyRegistration(passphrase);
                                    if (result.success) {
                                        setIsVaultModalOpen(false);
                                        setPassphrase('');
                                        setShowPasskeySetup(false);
                                    } else {
                                        setError(result.error || 'Passkey registration failed');
                                        setLoading(false);
                                    }
                                }}
                                disabled={loading}
                                sx={{
                                    py: 1.5,
                                    borderRadius: '16px',
                                    textTransform: 'none',
                                    fontSize: '1.1rem',
                                    fontWeight: 700,
                                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                    boxShadow: '0 10px 15px -12px rgba(16, 185, 129, 0.4)',
                                    '&:hover': {
                                        background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                                    },
                                }}
                            >
                                {loading ? <CircularProgress size={24} color="inherit" /> : 'Yes, Enable Passkey'}
                            </Button>

                            <Button
                                fullWidth
                                variant="text"
                                onClick={() => {
                                    setIsVaultModalOpen(false);
                                    setPassphrase('');
                                    setShowPasskeySetup(false);
                                }}
                                disabled={loading}
                                sx={{
                                    mt: 2,
                                    color: '#94a3b8',
                                    textTransform: 'none',
                                    '&:hover': {
                                        color: '#fff',
                                        backgroundColor: 'transparent'
                                    }
                                }}
                            >
                                Skip for now
                            </Button>
                        </>
                    ) : (
                        <>
                            <Box sx={{
                                p: 2,
                                borderRadius: '50%',
                                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                                mb: 3,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <LockOutlinedIcon sx={{ fontSize: '48px', color: '#818cf8' }} />
                            </Box>

                            <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, textAlign: 'center' }}>
                                {isMigrate ? 'Migrate to Vault' : isInit ? 'Setup Vault' : 'Unlock Vault'}
                            </Typography>

                            <Typography variant="body1" sx={{ color: '#94a3b8', mb: 4, textAlign: 'center' }}>
                                {isMigrate
                                    ? 'Your credentials are currently using a legacy encryption key. Create a vault passphrase to upgrade to the secure Memory-Locked Vault.'
                                    : isInit
                                        ? 'Create a passphrase to secure your bank and credit card credentials in memory.'
                                        : 'Credentials are encrypted and locked in memory. Enter your passphrase to continue.'}
                            </Typography>

                            {error && (
                                <Alert severity="error" sx={{ width: '100%', mb: 3, borderRadius: '12px' }}>
                                    {error}
                                </Alert>
                            )}

                            <form onSubmit={handleSubmit} style={{ width: '100%' }}>
                                <TextField
                                    fullWidth
                                    type={showPassphrase ? 'text' : 'password'}
                                    placeholder={isInit ? "Create passphrase" : "Enter passphrase"}
                                    value={passphrase}
                                    onChange={(e) => setPassphrase(e.target.value)}
                                    disabled={loading}
                                    variant="outlined"
                                    autoFocus
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <KeyIcon sx={{ color: '#6366f1' }} />
                                            </InputAdornment>
                                        ),
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                <IconButton
                                                    onClick={() => setShowPassphrase(!showPassphrase)}
                                                    edge="end"
                                                    sx={{ color: '#94a3b8' }}
                                                >
                                                    {showPassphrase ? <VisibilityOff /> : <Visibility />}
                                                </IconButton>
                                            </InputAdornment>
                                        ),
                                        sx: {
                                            borderRadius: '16px',
                                            backgroundColor: 'rgba(15, 23, 42, 0.5)',
                                            color: '#fff',
                                            '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.1)' },
                                            '&:hover fieldset': { borderColor: 'rgba(99, 102, 241, 0.5) !important' },
                                            '&.Mui-focused fieldset': { borderColor: '#6366f1 !important' },
                                        }
                                    }}
                                    sx={{ mb: (isInit || isMigrate) ? 2 : 3 }}
                                />

                                {(isInit || isMigrate) && (
                                    <TextField
                                        fullWidth
                                        type={showPassphrase ? 'text' : 'password'}
                                        placeholder="Confirm passphrase"
                                        value={confirmPassphrase}
                                        onChange={(e) => setConfirmPassphrase(e.target.value)}
                                        disabled={loading}
                                        variant="outlined"
                                        InputProps={{
                                            startAdornment: (
                                                <InputAdornment position="start">
                                                    <KeyIcon sx={{ color: '#6366f1' }} />
                                                </InputAdornment>
                                            ),
                                            sx: {
                                                borderRadius: '16px',
                                                backgroundColor: 'rgba(15, 23, 42, 0.5)',
                                                color: '#fff',
                                                '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.1)' },
                                                '&:hover fieldset': { borderColor: 'rgba(99, 102, 241, 0.5) !important' },
                                                '&.Mui-focused fieldset': { borderColor: '#6366f1 !important' },
                                            }
                                        }}
                                        sx={{ mb: 3 }}
                                    />
                                )}

                                <Button
                                    fullWidth
                                    type="submit"
                                    variant="contained"
                                    disabled={loading || !passphrase || ((isInit || isMigrate) && !confirmPassphrase)}
                                    sx={{
                                        py: 1.5,
                                        borderRadius: '16px',
                                        textTransform: 'none',
                                        fontSize: '1.1rem',
                                        fontWeight: 700,
                                        background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                                        boxShadow: '0 10px 15px -12px rgba(79, 70, 229, 0.4)',
                                        '&:hover': {
                                            background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                                        },
                                        '&.Mui-disabled': {
                                            background: 'rgba(255, 255, 255, 0.1)',
                                            color: 'rgba(255, 255, 255, 0.3)'
                                        }
                                    }}
                                >
                                    {loading ? <CircularProgress size={24} color="inherit" /> : (isMigrate ? 'Migrate to Vault' : isInit ? 'Initialize Vault' : 'Unlock Vault')}
                                </Button>

                                {!isInit && !isMigrate && (
                                    <Button
                                        fullWidth
                                        variant="outlined"
                                        onClick={async () => {
                                            setLoading(true);
                                            setError(null);
                                            const result = await unlockWithPasskey();
                                            if (!result.success) {
                                                setError(result.error || 'Passkey authentication failed');
                                                setLoading(false);
                                            } else {
                                                setLoading(false);
                                                setIsVaultModalOpen(false);
                                                setPassphrase('');
                                            }
                                        }}
                                        disabled={loading}
                                        startIcon={<KeyIcon />}
                                        sx={{
                                            mt: 2,
                                            py: 1.5,
                                            borderRadius: '16px',
                                            textTransform: 'none',
                                            fontSize: '1rem',
                                            fontWeight: 600,
                                            color: '#818cf8',
                                            borderColor: 'rgba(129, 140, 248, 0.3)',
                                            '&:hover': {
                                                borderColor: '#818cf8',
                                                backgroundColor: 'rgba(129, 140, 248, 0.05)',
                                            },
                                        }}
                                    >
                                        Unlock with Passkey
                                    </Button>
                                )}
                            </form>

                            <Typography variant="body2" sx={{ color: '#475569', mt: 3, textAlign: 'center', fontSize: '0.75rem' }}>
                                Unlocking is only required for syncing and credential management.
                                Data viewing and navigation are fully available.
                            </Typography>
                        </>
                    )}
                </DialogContent>
            </Box>
        </StyledDialog>
    );
};

export default VaultLockScreen;
