import { Toaster as HotToaster } from 'react-hot-toast';

export function Toaster() {
  return (
    <HotToaster
      // Below the header, so Publish and a sheet's close button stay clickable.
      position='bottom-center'
      containerStyle={{ bottom: 24, left: 16, right: 16 }}
      toastOptions={{
        duration: 3000,
        style: {
          borderRadius: '32px',
          boxShadow: 'none',
          padding: '0.4rem 1rem',
          maxWidth: '28rem',
          fontSize: '0.875rem',
          borderBottomWidth: '1px',
          borderBottomStyle: 'solid',
        },
        success: {
          style: {
            background: '#ECFDF5',
            color: '#166534',
            borderBottomColor: '#D6DFE6',
          },
        },
        error: {
          style: {
            background: '#FEE2E2',
            color: '#991B1B',
            borderBottomColor: '#EAD1D1',
          },
          duration: 6000,
        },
        loading: {
          style: {
            background: '#E8EDFB',
            color: '#1D4ED8',
            borderBottomColor: '#CAD5F6',
            borderBottomWidth: '1px',
            borderBottomStyle: 'solid',
          },
        },
      }}
    />
  );
}
