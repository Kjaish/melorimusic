// PM2 Ecosystem Configuration for Melori Music Platform
// Usage: pm2 start ecosystem.config.cjs --env production

module.exports = {
    apps: [{
        name: 'melori-node',
        script: './dist/index.cjs',
        instances: 1,
        exec_mode: 'fork',

        // Environment variables for production
        env_production: {
            NODE_ENV: 'production',
            PORT: 3001
        },

        // Logging configuration
        error_file: './logs/pm2-error.log',
        out_file: './logs/pm2-out.log',
        log_file: './logs/pm2-combined.log',
        time: true,

        // Auto-restart configuration
        watch: false,
        max_memory_restart: '1G',

        // Instance management
        autorestart: true,
        max_restarts: 10,
        min_uptime: '10s',

        // Graceful shutdown
        kill_timeout: 5000,
        wait_ready: true,
        listen_timeout: 3000
    }]
};
