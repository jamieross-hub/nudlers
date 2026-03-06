import type { Meta, StoryObj } from '@storybook/react';
import { Box } from '@mui/material';
import React from 'react';
import RecentTransactionsModule from '../components/RecentTransactionsModule';

const meta: Meta<typeof RecentTransactionsModule> = {
    title: 'Components/RecentTransactionsModule',
    component: RecentTransactionsModule,
    parameters: {
        layout: 'padded',
    },
    tags: ['autodocs'],
    decorators: [
        (Story) => (
            <Box sx={{ p: 4, maxWidth: '600px', mx: 'auto' }}>
                <Story />
            </Box>
        ),
    ],
};

export default meta;

type Story = StoryObj<typeof RecentTransactionsModule>;

export const Default: Story = {
    render: () => <RecentTransactionsModule />,
};
