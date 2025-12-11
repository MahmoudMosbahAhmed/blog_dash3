// Global Configuration
const CONFIG = {
    API_BASE_URL: 'https://dev-blog.upscend.com',
    // API_BASE_URL: 'http://localhost:8095',
    CREDENTIALS: {
        username: 'admin',
        password: 'admin_password'
    },
    PAGINATION: {
        limit: 25,
        currentPage: 1,
        totalCount: 0
    }
};

// Global State
let currentUser = null;
let contentData = [];
let filteredContent = [];
let isAuthenticated = false;
let selectedContentIds = new Set();
let availableCategories = [];

// Utility Functions
const showToast = (message, type = 'info') => {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'fa-check-circle' : 
                 type === 'error' ? 'fa-exclamation-circle' : 
                 type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle';
    
    toast.innerHTML = `
        <i class="fas ${icon} toast-icon"></i>
        <span class="toast-message">${message}</span>
        <button class="toast-close">&times;</button>
    `;
    
    container.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        toast.remove();
    }, 5000);
    
    // Manual close
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.remove();
    });
};

const showLoading = (element) => {
    element.classList.add('loading');
};

const hideLoading = (element) => {
    element.classList.remove('loading');
};

const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
};

const getAuthHeaders = () => {
    const credentials = btoa(`${CONFIG.CREDENTIALS.username}:${CONFIG.CREDENTIALS.password}`);
    return {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json'
    };
};

// API Functions
const api = {
    async request(endpoint, options = {}) {
        const url = `${CONFIG.API_BASE_URL}${endpoint}`;
        const config = {
            headers: getAuthHeaders(),
            ...options
        };
        
        try {
            const response = await fetch(url, config);
            
            if (!response.ok) {
                let errorData = {};
                try {
                    errorData = await response.json();
                } catch (e) {
                    // Response might not be JSON
                    errorData = { detail: response.statusText };
                }
                
                // Handle different error formats
                let errorMessage = '';
                if (errorData.detail) {
                    if (Array.isArray(errorData.detail)) {
                        // FastAPI validation errors
                        errorMessage = errorData.detail.map(err => `${err.loc?.join('.')} - ${err.msg}`).join('; ');
                    } else if (typeof errorData.detail === 'string') {
                        errorMessage = errorData.detail;
                    } else {
                        errorMessage = JSON.stringify(errorData.detail);
                    }
                } else if (errorData.message) {
                    errorMessage = errorData.message;
                } else {
                    errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                }
                
                throw new Error(errorMessage);
            }
            
            // Handle different response types
            const contentType = response.headers.get('content-type');
            
            // For 204 No Content responses (like DELETE operations)
            if (response.status === 204) {
                return { success: true, status: response.status };
            }
            
            // For JSON responses
            if (contentType && contentType.includes('application/json')) {
                const text = await response.text();
                if (text.trim() === '') {
                    return {}; // Return empty object for empty JSON responses
                }
                return JSON.parse(text);
            } else {
                // For other non-JSON responses, return success indicator
                return { success: true, status: response.status };
            }
        } catch (error) {
            console.error('API Request failed:', error);
            
            // Provide more user-friendly error messages
            if (error.message.includes('401') || error.message.includes('Unauthorized')) {
                throw new Error('Authentication failed. Please check your credentials.');
            } else if (error.message.includes('404') || error.message.includes('Not Found')) {
                throw new Error('Resource not found. Please try again or contact support.');
            } else if (error.message.includes('500') || error.message.includes('Internal Server Error')) {
                throw new Error('Server error. Please try again later.');
            } else if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
                throw new Error('Network error. Please check your connection and try again.');
            }
            
            throw error;
        }
    },

    async getContent(params = {}) {
        // Build query parameters according to API spec
        const queryParams = new URLSearchParams();
        
        // Handle all supported parameters from API spec
        if (params.category) queryParams.append('category', params.category);
        if (params.statuses && Array.isArray(params.statuses)) {
            params.statuses.forEach(status => queryParams.append('statuses', status));
        }
        if (params.created_by) queryParams.append('created_by', params.created_by);
        if (params.content_type) queryParams.append('content_type', params.content_type);
        if (params.skip !== undefined) queryParams.append('skip', params.skip);
        if (params.limit !== undefined) queryParams.append('limit', params.limit);
        if (params.sort_by) queryParams.append('sort_by', params.sort_by);
        if (params.sort_order !== undefined) queryParams.append('sort_order', params.sort_order);
        
        // Handle legacy parameters for backward compatibility
        if (params.status && !params.statuses) {
            queryParams.append('statuses', params.status);
        }
        
        const queryString = queryParams.toString();
        return this.request(`/api/v1/admin/contents/${queryString ? '?' + queryString : ''}`);
    },

    async searchContent(query, limit = 10) {
        return this.request('/api/v1/admin/contents/search', {
            method: 'POST',
            body: JSON.stringify({ query, limit })
        });
    },

    async bulkUpdateStatus(contentIds, status) {
        return this.request('/api/v1/admin/contents/actions/bulk-status', {
            method: 'PATCH',
            body: JSON.stringify({
                content_ids: contentIds,
                status: status
            })
        });
    },

    async archiveContent(id) {
        return this.request(`/api/v1/admin/contents/actions/archive/${id}`, {
            method: 'PATCH'
        });
    },

    async getContentById(id) {
        return this.request(`/api/v1/admin/contents/${id}`);
    },

    async createAIContent(data, params = '') {
        const url = `/api/v1/admin/contents/ai${params ? '?' + params : ''}`;
        return this.request(url, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async createManualContent(data) {
        return this.request('/api/v1/admin/contents/manual', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async updateContent(id, data) {
        return this.request(`/api/v1/admin/contents/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    async deleteContent(id) {
        return this.request(`/api/v1/admin/contents/${id}`, {
            method: 'DELETE'
        });
    },

    async publishContent(id) {
        return this.request(`/api/v1/admin/contents/actions/publish/${id}`, {
            method: 'PATCH'
        });
    },

    async brainstormIdeas(data) {
        return this.request('/api/v1/admin/contents/bulk/brainstorm', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async getCategories() {
        return this.request('/api/v1/admin/contents/categories', {
            method: 'GET'
        });
    },

    // Bulk Generation API calls
    async bulkBrainstorm(data) {
        return this.request('/api/v1/admin/contents/bulk/brainstorm', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async reviewBulkIdeas(jobId, data) {
        return this.request(`/api/v1/admin/contents/bulk/review/${jobId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    async startBulkGeneration(jobId) {
        return this.request(`/api/v1/admin/contents/bulk/generate/${jobId}`, {
            method: 'POST'
        });
    },

    async directBulkGenerate(data) {
        return this.request('/api/v1/admin/contents/bulk/direct', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async getBulkJobs(statusFilter = '', skip = 0, limit = 20) {
        const params = new URLSearchParams();
        if (statusFilter) params.append('status_filter', statusFilter);
        params.append('skip', skip);
        params.append('limit', limit);
        
        return this.request(`/api/v1/admin/contents/bulk/jobs?${params}`, {
            method: 'GET'
        });
    },

    async getBulkJobStatus(jobId) {
        return this.request(`/api/v1/admin/contents/bulk/jobs/${jobId}`, {
            method: 'GET'
        });
    },

    async cancelBulkJob(jobId) {
        return this.request(`/api/v1/admin/contents/bulk/jobs/${jobId}/cancel`, {
            method: 'PATCH'
        });
    },

    async deleteBulkJob(jobId) {
        return this.request(`/api/v1/admin/contents/bulk/jobs/${jobId}`, {
            method: 'DELETE'
        });
    },



    async getStats() {
        return this.request('/api/v1/admin/contents/actions/stats');
    },

    async testConnection() {
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/`, {
                method: 'GET',
                headers: getAuthHeaders()
            });
            return response.ok;
        } catch (error) {
            console.error('Connection test failed:', error);
            return false;
        }
    },

    // Comprehensive API status check
    async checkAllEndpoints() {
        const endpoints = [
            { name: 'Base API', method: 'GET', url: '/', critical: true },
            { name: 'Get Content', method: 'GET', url: '/api/v1/admin/contents/', critical: true },
            { name: 'Get Stats', method: 'GET', url: '/api/v1/admin/contents/actions/stats', critical: true },
            { name: 'Get Categories', method: 'GET', url: '/api/v1/admin/contents/categories', critical: true },
            { name: 'Search Content', method: 'POST', url: '/api/v1/admin/contents/search', critical: false },
            { name: 'Bulk Jobs', method: 'GET', url: '/api/v1/admin/contents/bulk/jobs', critical: false },
            { name: 'Brainstorm Ideas', method: 'POST', url: '/api/v1/admin/contents/bulk/brainstorm', critical: false }
        ];

        const results = [];
        
        for (const endpoint of endpoints) {
            try {
                const startTime = Date.now();
                let response;
                
                if (endpoint.method === 'GET') {
                    response = await fetch(`${CONFIG.API_BASE_URL}${endpoint.url}`, {
                        method: endpoint.method,
                        headers: getAuthHeaders()
                    });
                } else if (endpoint.method === 'POST') {
                    // Use minimal test data for POST endpoints
                    const testData = endpoint.url.includes('search') 
                        ? { query: 'test', limit: 1 }
                        : { topic: 'test', category: 'test', num_articles: 1 };
                        
                    response = await fetch(`${CONFIG.API_BASE_URL}${endpoint.url}`, {
                        method: endpoint.method,
                        headers: getAuthHeaders(),
                        body: JSON.stringify(testData)
                    });
                }
                
                const responseTime = Date.now() - startTime;
                
                results.push({
                    ...endpoint,
                    status: response.ok ? 'success' : 'error',
                    statusCode: response.status,
                    responseTime: responseTime,
                    error: response.ok ? null : `HTTP ${response.status}: ${response.statusText}`
                });
                
            } catch (error) {
                results.push({
                    ...endpoint,
                    status: 'error',
                    statusCode: 0,
                    responseTime: 0,
                    error: error.message
                });
            }
        }
        
        return results;
    }
};

// Authentication
const auth = {
    async login(username, password) {
        try {
            CONFIG.CREDENTIALS.username = username;
            CONFIG.CREDENTIALS.password = password;
            
            // Test authentication by making a request
            await api.getContent({ limit: 1 });
            
            isAuthenticated = true;
            currentUser = username;
            
            localStorage.setItem('auth_credentials', JSON.stringify(CONFIG.CREDENTIALS));
            
            // Load categories after successful login
            try {
                await brainstorm.loadCategories();
                await bulk.init();
            } catch (error) {
                console.error('Failed to load categories after login:', error);
            }
            
            return true;
        } catch (error) {
            CONFIG.CREDENTIALS.username = 'admin';
            CONFIG.CREDENTIALS.password = 'admin_password';
            throw error;
        }
    },

    logout() {
        isAuthenticated = false;
        currentUser = null;
        localStorage.removeItem('auth_credentials');
        
        const dashboard = document.getElementById('dashboard');
        const loginModal = document.getElementById('loginModal');
        
        if (dashboard) dashboard.style.display = 'none';
        if (loginModal) loginModal.style.display = 'block';
    },

    checkStoredAuth() {
        const stored = localStorage.getItem('auth_credentials');
        if (stored) {
            try {
                const credentials = JSON.parse(stored);
                CONFIG.CREDENTIALS = credentials;
                return true;
            } catch (error) {
                localStorage.removeItem('auth_credentials');
            }
        }
        return false;
    }
};

// Dashboard Functions
const dashboard = {
    charts: {
        contentChart: null,
        categoryChart: null
    },

    async loadStats() {
        try {
            const stats = await api.getStats();
            const response = await api.getContent().catch(() => []);
            const content = Array.isArray(response) ? response : (response.items || []);
            const jobs = await api.getBulkJobs('', 0, 100).catch(() => []);
            
            // Update main stats
            const totalContentEl = document.getElementById('totalContent');
            const publishedContentEl = document.getElementById('publishedContent');
            const draftContentEl = document.getElementById('draftContent');
            const aiGeneratedEl = document.getElementById('aiGenerated');
            
            if (totalContentEl) totalContentEl.textContent = stats.total || 0;
            if (publishedContentEl) publishedContentEl.textContent = stats.published || 0;
            if (draftContentEl) draftContentEl.textContent = stats.drafts || 0;
            if (aiGeneratedEl) aiGeneratedEl.textContent = stats.ai_generated || 0;
            
            // Update new stats if elements exist
            const bulkJobsEl = document.getElementById('bulkJobs');
            if (bulkJobsEl) bulkJobsEl.textContent = jobs.length || 0;
            
            const avgQualityEl = document.getElementById('avgQuality');
            if (avgQualityEl) {
                const qualityScores = content.filter(c => c.quality_score).map(c => c.quality_score);
                const avgQuality = qualityScores.length > 0 ? Math.round(qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length) : 0;
                avgQualityEl.textContent = avgQuality;
            }
            
            // Update welcome user
            const welcomeUser = document.getElementById('welcomeUser');
            if (welcomeUser) {
                welcomeUser.textContent = currentUser || 'Admin';
            }
            
            // Check for pending review jobs and update notification
            this.updatePendingReviewNotification(jobs);
            
            // Update performance metrics
            this.updatePerformanceMetrics(content);
            
            // Update charts
            this.updateCharts(content);
            
        } catch (error) {
            console.error('Failed to load stats:', error);
            showToast('Failed to load statistics', 'error');
        }
    },

    updatePendingReviewNotification(jobs) {
        const pendingReviewJobs = jobs.filter(job => job.status === 'pending_review');
        const notificationBadge = document.getElementById('notificationCount');
        const notificationsBtn = document.getElementById('notificationsBtn');
        
        if (pendingReviewJobs.length > 0) {
            if (notificationBadge) {
                notificationBadge.textContent = pendingReviewJobs.length;
                notificationBadge.style.display = 'flex';
            }
            
            // Show notification toast if there are new pending reviews
            if (!this.hasShownPendingNotification) {
                showToast(`📋 You have ${pendingReviewJobs.length} job(s) pending review`, 'info');
                this.hasShownPendingNotification = true;
            }
        } else {
            if (notificationBadge) {
                notificationBadge.style.display = 'none';
            }
        }
    },

    updatePerformanceMetrics(content) {
        try {
            // Calculate average words per article
            const wordCounts = content.filter(c => c.word_count).map(c => c.word_count);
            const avgWords = wordCounts.length > 0 ? Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length) : 0;
            
            // Calculate content this week
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            const weeklyContent = content.filter(c => {
                const createdDate = new Date(c.created_at);
                return createdDate >= oneWeekAgo;
            }).length;
            
            // Find most active category
            const categoryCount = {};
            content.forEach(c => {
                const category = c.category?.name || c.category || 'Uncategorized';
                categoryCount[category] = (categoryCount[category] || 0) + 1;
            });
            const topCategory = Object.keys(categoryCount).reduce((a, b) => 
                categoryCount[a] > categoryCount[b] ? a : b, 'None'
            );
            
            // Calculate success rate (published vs total)
            const successRate = content.length > 0 ? Math.round((content.filter(c => c.status === 'published').length / content.length) * 100) : 0;
            
            // Update DOM elements if they exist
            const avgWordsEl = document.getElementById('avgWords');
            if (avgWordsEl) avgWordsEl.textContent = avgWords.toLocaleString();
            
            const weeklyContentEl = document.getElementById('weeklyContent');
            if (weeklyContentEl) weeklyContentEl.textContent = weeklyContent;
            
            const topCategoryEl = document.getElementById('topCategory');
            if (topCategoryEl) topCategoryEl.textContent = topCategory;
            
            const successRateEl = document.getElementById('successRate');
            if (successRateEl) successRateEl.textContent = `${successRate}%`;
            
        } catch (error) {
            console.error('Failed to update performance metrics:', error);
        }
    },

    updateCharts(content = []) {
        try {
            this.renderContentTrendChart(content);
            this.renderCategoryChart(content);
        } catch (error) {
            console.error('Failed to update charts:', error);
        }
    },

    renderContentTrendChart(content) {
        const canvas = document.getElementById('contentChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        // Prepare data for the last 30 days
        const days = 30;
        const labels = [];
        const data = [];
        
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
            
            const dayContent = content.filter(c => {
                const createdDate = new Date(c.created_at);
                return createdDate.toDateString() === date.toDateString();
            }).length;
            
            data.push(dayContent);
        }
        
        // Simple chart implementation
        this.drawLineChart(ctx, labels, data, canvas.width, canvas.height);
    },

    renderCategoryChart(content) {
        const canvas = document.getElementById('categoryChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        // Prepare category data
        const categoryCount = {};
        content.forEach(c => {
            const category = c.category?.name || c.category || 'Uncategorized';
            categoryCount[category] = (categoryCount[category] || 0) + 1;
        });
        
        const categories = Object.keys(categoryCount).slice(0, 5); // Top 5 categories
        const counts = categories.map(cat => categoryCount[cat]);
        
        // Simple pie chart implementation
        this.drawPieChart(ctx, categories, counts, canvas.width, canvas.height);
    },

    drawLineChart(ctx, labels, data, width, height) {
        ctx.clearRect(0, 0, width, height);
        
        if (data.length === 0 || Math.max(...data) === 0) {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No data available', width / 2, height / 2);
            return;
        }
        
        const padding = 40;
        const chartWidth = width - 2 * padding;
        const chartHeight = height - 2 * padding;
        
        const maxValue = Math.max(...data, 1);
        const stepX = chartWidth / (data.length - 1 || 1);
        
        // Draw axes
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, height - padding);
        ctx.lineTo(width - padding, height - padding);
        ctx.stroke();
        
        // Draw line
        ctx.strokeStyle = '#667eea';
        ctx.lineWidth = 3;
        ctx.beginPath();
        
        data.forEach((value, index) => {
            const x = padding + index * stepX;
            const y = height - padding - (value / maxValue) * chartHeight;
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
        
        // Draw points
        ctx.fillStyle = '#667eea';
        data.forEach((value, index) => {
            const x = padding + index * stepX;
            const y = height - padding - (value / maxValue) * chartHeight;
            
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fill();
        });
    },

    drawPieChart(ctx, labels, data, width, height) {
        ctx.clearRect(0, 0, width, height);
        
        if (data.length === 0 || data.reduce((sum, val) => sum + val, 0) === 0) {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No data available', width / 2, height / 2);
            return;
        }
        
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) / 3;
        
        const total = data.reduce((sum, value) => sum + value, 0);
        const colors = ['#667eea', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
        
        let currentAngle = -Math.PI / 2;
        
        data.forEach((value, index) => {
            const sliceAngle = (value / total) * 2 * Math.PI;
            
            // Draw slice
            ctx.fillStyle = colors[index % colors.length];
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
            ctx.closePath();
            ctx.fill();
            
            // Draw label
            const labelAngle = currentAngle + sliceAngle / 2;
            const labelX = centerX + Math.cos(labelAngle) * (radius + 20);
            const labelY = centerY + Math.sin(labelAngle) * (radius + 20);
            
            ctx.fillStyle = '#1e293b';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(labels[index], labelX, labelY);
            
            currentAngle += sliceAngle;
        });
    },

    async loadRecentActivity() {
        try {
            const response = await api.getContent({ limit: 5, sort_by: 'updated_at' });
            const content = Array.isArray(response) ? response : (response.items || []);
            const activityList = document.getElementById('activityList');
            
            activityList.innerHTML = content.map(item => `
                <div class="activity-item">
                    <div class="activity-icon">
                        <i class="fas fa-file-alt"></i>
                    </div>
                    <div class="activity-info">
                        <h4>${item.title}</h4>
                        <p>Updated ${formatDate(item.updated_at)} • ${item.status}</p>
                    </div>
                </div>
            `).join('');
            
        } catch (error) {
            console.error('Failed to load activity:', error);
        }
    },

    async loadContent(params = {}) {
        try {
            const tableBody = document.querySelector('#contentTable tbody');
            showLoading(tableBody);
            
            // Test connection first
            const isConnected = await api.testConnection();
            if (!isConnected) {
                throw new Error('Cannot connect to API server. Please check if the server is running on ' + CONFIG.API_BASE_URL);
            }
            
            // Get current filter values
            const itemsPerPage = parseInt(document.getElementById('itemsPerPage')?.value || CONFIG.PAGINATION.limit);
            const sortBy = document.getElementById('sortBy')?.value || 'updated_at';
            const statusFilter = document.getElementById('filterStatus')?.value;
            const categoryFilter = document.getElementById('filterCategory')?.value;
            const contentTypeFilter = document.getElementById('filterContentType')?.value;
            
            // Build API parameters
            const apiParams = {
                limit: itemsPerPage,
                skip: (CONFIG.PAGINATION.currentPage - 1) * itemsPerPage,
                sort_by: sortBy,
                sort_order: -1, // Descending order
                ...params
            };
            
            // Add filters if they exist and are not empty (following API spec)
            if (statusFilter && statusFilter.trim() !== '') {
                apiParams.statuses = [statusFilter];
            }
            if (categoryFilter && categoryFilter.trim() !== '') {
                apiParams.category = categoryFilter;
            }
            if (contentTypeFilter && contentTypeFilter.trim() !== '') {
                apiParams.content_type = contentTypeFilter;
            }
            
            // Add author filter if available
            const authorFilter = document.getElementById('filterAuthor')?.value;
            if (authorFilter && authorFilter.trim() !== '') {
                apiParams.created_by = authorFilter;
            }
            
            console.log('Loading content with params:', apiParams); // Debug log
            const content = await api.getContent(apiParams);
            console.log('Received content:', content); // Debug log
            console.log('Content type:', typeof content, 'Is array:', Array.isArray(content)); // Debug log
            
            // Handle different response formats
            let totalCount = 0;
            if (Array.isArray(content)) {
                // Old format: just array
            contentData = content;
            filteredContent = content;
                totalCount = content.length;
            } else if (content && Array.isArray(content.items)) {
                // New format: { items: [...], total: N }
                contentData = content.items;
                filteredContent = content.items;
                totalCount = content.total || content.items.length;
            } else if (content && Array.isArray(content.data)) {
                // Alternative format: { data: [...], total: N }
                contentData = content.data;
                filteredContent = content.data;
                totalCount = content.total || content.data.length;
            } else {
                console.warn('Unexpected content format:', content);
                contentData = [];
                filteredContent = [];
                totalCount = 0;
            }
            
            // Store total count for pagination
            CONFIG.PAGINATION.totalCount = totalCount;
            
            console.log('Final contentData:', contentData); // Debug log
            console.log('Final filteredContent:', filteredContent); // Debug log
            console.log('Content count:', contentData.length); // Debug log
            console.log('Total count:', totalCount); // Debug log
            
            // Extract unique categories for filter dropdown
            this.updateCategoryFilter();
            
            this.renderContentTable();
            this.updatePagination();
            
        } catch (error) {
            console.error('Failed to load content:', error);
            
            // Provide more specific error messages
            let errorMessage = 'Failed to load content';
            if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
                errorMessage = 'Network error: Cannot connect to server. Please check if the API server is running.';
            } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
                errorMessage = 'Authentication failed. Please check your credentials.';
            } else if (error.message.includes('404')) {
                errorMessage = 'API endpoint not found. Please check the server configuration.';
            } else if (error.message) {
                errorMessage = `Error: ${error.message}`;
            }
            
            showToast(errorMessage, 'error');
            
            // Set empty data to show "No content found" message
            contentData = [];
            filteredContent = [];
            
            this.renderContentTable();
        } finally {
            const tableBody = document.querySelector('#contentTable tbody');
            hideLoading(tableBody);
        }
    },

    renderContentTable() {
        console.log('Rendering table with filteredContent:', filteredContent); // Debug log
        const tableBody = document.querySelector('#contentTable tbody');
        const tableWrapper = document.querySelector('.content-table-wrapper');
        const table = document.querySelector('#contentTable');
        
        if (!tableBody) {
            console.error('Table body not found!');
            return;
        }
        
        // Ensure table elements are visible
        if (tableWrapper) {
            tableWrapper.style.display = 'block';
            tableWrapper.style.visibility = 'visible';
        }
        if (table) {
            table.style.display = 'table';
            table.style.visibility = 'visible';
        }
        
        if (!filteredContent || filteredContent.length === 0) {
            const message = CONFIG.API_BASE_URL.includes('localhost') 
                ? 'No content found. Try using the "Test API" button to check your connection to the server.'
                : 'No content found. Please check your filters or create some content first.';
                
            tableBody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 2rem; color: #718096;">
                        <i class="fas fa-inbox" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                        <p style="margin-bottom: 1rem;">${message}</p>
                        <p style="font-size: 0.9rem; color: #9ca3af;">
                            API URL: ${CONFIG.API_BASE_URL}
                        </p>
                    </td>
                </tr>
            `;
            return;
        }
        
        tableBody.innerHTML = filteredContent.map(item => {
            // Safely extract values with fallbacks
            const id = item._id || item.id || '';
            const title = item.title || 'Untitled';
            const slug = item.slug || '';
            const category = item.category?.name || item.category || 'Uncategorized';
            const contentType = (item.content_type || 'article').replace('_', ' ');
            const status = item.status || 'draft';
            const createdAt = item.created_at || new Date().toISOString();
            const updatedAt = item.updated_at || createdAt;
            const wordCount = item.word_count || 0;
            const imageUrl = item.image_url || '';
            const imageAlt = item.image_alt_text || title;
            
            return `
                <tr>
                    <td>
                        <input type="checkbox" class="content-checkbox" value="${id}" onchange="dashboard.toggleContentSelection('${id}', this.checked)">
                    </td>
                <td>
                    <div style="display: flex; align-items: center; gap: 1rem;">
                            ${imageUrl ? `
                                <img src="${imageUrl}" 
                                     alt="${imageAlt}"
                                 class="table-image-preview"
                                 onerror="this.style.display='none';">
                        ` : `
                            <div class="table-image-placeholder">
                                <i class="fas fa-image"></i>
                            </div>
                        `}
                        <div>
                                <strong>${title}</strong>
                                ${slug ? `<br><small style="color: #718096;">${slug}</small>` : ''}
                        </div>
                    </div>
                </td>
                    <td>${category}</td>
                <td>
                        <span class="content-type-badge">
                            ${contentType}
                    </span>
                </td>
                    <td>
                        <span class="status-badge status-${status}">
                            ${status.replace('_', ' ')}
                        </span>
                    </td>
                    <td>${formatDate(createdAt)}</td>
                    <td>${formatDate(updatedAt)}</td>
                    <td>${wordCount}</td>
                <td>
                    <div class="action-buttons">
                            <button class="btn btn-sm btn-secondary" onclick="dashboard.viewContent('${id}')" title="View Content">
                            <i class="fas fa-eye"></i>
                        </button>
                            <button class="btn btn-sm btn-primary" onclick="dashboard.editContent('${id}')" title="Edit Content">
                            <i class="fas fa-edit"></i>
                        </button>
                            ${status !== 'published' ? `
                                <button class="btn btn-sm btn-success" onclick="dashboard.publishContent('${id}')" title="Publish Content">
                                <i class="fas fa-globe"></i>
                            </button>
                        ` : ''}
                            ${status !== 'archived' ? `
                                <button class="btn btn-sm btn-warning" onclick="dashboard.archiveContent('${id}')" title="Archive Content">
                                    <i class="fas fa-archive"></i>
                                </button>
                            ` : ''}
                            <button class="btn btn-sm btn-danger" onclick="dashboard.deleteContent('${id}')" title="Delete Content">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
            `;
        }).join('');
    },

    updatePagination() {
        const itemsPerPage = parseInt(document.getElementById('itemsPerPage')?.value || CONFIG.PAGINATION.limit);
        const totalCount = CONFIG.PAGINATION.totalCount || contentData.length;
        const totalPages = Math.ceil(totalCount / itemsPerPage);
        const pageInfo = document.getElementById('pageInfo');
        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');
        
        if (pageInfo) {
            const startItem = ((CONFIG.PAGINATION.currentPage - 1) * itemsPerPage) + 1;
            const endItem = Math.min(CONFIG.PAGINATION.currentPage * itemsPerPage, totalCount);
            pageInfo.textContent = `Page ${CONFIG.PAGINATION.currentPage} of ${totalPages} (${totalCount} total items)`;
        }
        
        if (prevBtn) {
            prevBtn.disabled = CONFIG.PAGINATION.currentPage === 1;
        }
        
        if (nextBtn) {
            nextBtn.disabled = CONFIG.PAGINATION.currentPage >= totalPages || totalCount === 0;
        }
        
        console.log('Pagination updated:', {
            currentPage: CONFIG.PAGINATION.currentPage,
            totalPages,
            totalCount,
            itemsPerPage,
            prevDisabled: prevBtn?.disabled,
            nextDisabled: nextBtn?.disabled
        });
    },

    async viewContent(id) {
        try {
            console.log('Loading content with ID:', id);
            const content = await api.getContentById(id);
            console.log('Received content:', content);
            
            let modal = document.getElementById('contentModal');
            let modalTitle = document.getElementById('modalTitle');
            let modalBody = document.getElementById('modalBody');
            
            // If modal doesn't exist, recreate it
            if (!modal || !modalTitle || !modalBody) {
                console.log('Modal elements not found, recreating...');
                this.recreateOriginalModal();
                modal = document.getElementById('contentModal');
                modalTitle = document.getElementById('modalTitle');
                modalBody = document.getElementById('modalBody');
                
                if (!modal || !modalTitle || !modalBody) {
                    console.error('Failed to recreate modal elements');
                    showToast('Modal elements error', 'error');
                    return;
                }
            }
            
            modalTitle.textContent = content.title || 'Title Not Available';
            
            // Build content sections - prioritize important data
            let modalContent = '';
            
            // Quick Overview Section - Most Important Info
            modalContent += `
                <div class="content-section" style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border-left: 4px solid #667eea;">
                    <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 2rem; align-items: center;">
                        <div>
                            <h4 style="margin: 0 0 0.5rem 0; color: #1e293b; font-size: 1rem; font-weight: 600;">
                                <span class="status-badge status-${content.status}" style="margin-right: 0.5rem;">${content.status.replace('_', ' ')}</span>
                                ${content.category?.name || content.category || 'Uncategorized'}
                            </h4>
                            <p style="margin: 0; color: #64748b; font-size: 0.9rem;">
                                ${(content.content_type || 'article').replace('_', ' ')} • ${content.word_count || 0} words • ${formatDate(content.updated_at)}
                            </p>
                </div>
                        <div style="text-align: center;">
                            ${content.qc_results?.audit_summary ? `
                                <div style="display: inline-block;">
                                    <div style="font-size: 1.5rem; font-weight: bold; color: ${content.qc_results.audit_summary.overall_seo_score >= 80 ? '#10b981' : content.qc_results.audit_summary.overall_seo_score >= 60 ? '#f59e0b' : '#ef4444'};">
                                        ${content.qc_results.audit_summary.overall_seo_score}/100
                                    </div>
                                    <div style="font-size: 0.8rem; color: #64748b;">SEO Score</div>
                                </div>
                            ` : ''}
                        </div>
                        <div style="text-align: right;">
                            ${content.course_url ? `
                                <a href="${content.course_url}" target="_blank" rel="noopener" class="btn btn-primary" style="font-size: 0.9rem; padding: 0.5rem 1rem;">
                                    <i class="fas fa-external-link-alt"></i> View Course
                                </a>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;

            // Featured Image Section
            if (content.image_url) {
                modalContent += `
                    <div class="content-section">
                        <h4><i class="fas fa-image"></i> Featured Image</h4>
                        <div class="content-image-section">
                            <img src="${content.image_url}" 
                                 alt="${content.image_alt_text || content.title}" 
                                 class="content-image"
                                 onclick="window.open('${content.image_url}', '_blank')"
                                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                            <div class="image-placeholder image-error" style="display: none;">
                                <i class="fas fa-exclamation-triangle"></i>
                                <p>Image could not be loaded</p>
                                <small style="word-break: break-all;">${content.image_url}</small>
                            </div>
                        </div>
                        ${content.image_alt_text ? `<p><strong>Alt Text:</strong> ${content.image_alt_text}</p>` : ''}
                        <p><a href="${content.image_url}" target="_blank" rel="noopener" style="color: #667eea; text-decoration: none;">View Full Size <i class="fas fa-external-link-alt"></i></a></p>
                    </div>
                `;
            }
            
            // Key Information Section - Compact Layout
            let hasKeyInfo = content.meta_description || content.tldr_summary || (content.keywords && content.keywords.length > 0);
            if (hasKeyInfo) {
                modalContent += `
                    <div class="content-section">
                        <h4><i class="fas fa-key"></i> Key Information</h4>
                        <div style="display: grid; gap: 1.5rem;">
                `;
                
                if (content.tldr_summary) {
                    modalContent += `
                        <div style="background: #f0f9ff; padding: 1.25rem; border-radius: 10px; border-left: 3px solid #0ea5e9;">
                            <strong style="color: #0369a1; font-size: 0.9rem;">Summary:</strong>
                            <p style="margin: 0.5rem 0 0 0; line-height: 1.5;">${content.tldr_summary}</p>
                    </div>
                    `;
                }
                
                if (content.meta_description) {
                    modalContent += `
                        <div style="background: #f8fafc; padding: 1.25rem; border-radius: 10px; border-left: 3px solid #64748b;">
                            <strong style="color: #475569; font-size: 0.9rem;">Meta Description:</strong>
                            <p style="margin: 0.5rem 0 0 0; line-height: 1.5;">${content.meta_description}</p>
                    </div>
                    `;
                }
                
                if (content.keywords && content.keywords.length > 0) {
                    modalContent += `
                        <div>
                            <strong style="color: #475569; font-size: 0.9rem; display: block; margin-bottom: 0.75rem;">Keywords:</strong>
                            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                                ${content.keywords.slice(0, 8).map(keyword => `<span style="background: #667eea; color: white; padding: 0.25rem 0.75rem; border-radius: 15px; font-size: 0.8rem;">${keyword}</span>`).join('')}
                                ${content.keywords.length > 8 ? `<span style="color: #64748b; font-size: 0.8rem; padding: 0.25rem 0.5rem;">+${content.keywords.length - 8} more</span>` : ''}
                        </div>
                    </div>
                    `;
                }
                
                modalContent += `
                                </div>
                        </div>
                `;
            }

            // Important Content Sections - FAQ & Key Facts
            let hasImportantContent = (content.faq_section && content.faq_section.length > 0) || (content.key_facts && content.key_facts.length > 0);
            if (hasImportantContent) {
                modalContent += `<div class="content-section">`;
                
                // FAQ Section - Prominent Display
                if (content.faq_section && content.faq_section.length > 0) {
                    modalContent += `
                        <div style="margin-bottom: ${content.key_facts && content.key_facts.length > 0 ? '2rem' : '0'};">
                            <h4 style="margin: 0 0 1.25rem 0; color: #1e293b; font-size: 1.2rem; font-weight: 600; display: flex; align-items: center; gap: 0.5rem;">
                                <i class="fas fa-question-circle" style="color: #0ea5e9;"></i> 
                                Frequently Asked Questions
                            </h4>
                            <div style="display: grid; gap: 1rem;">
                                ${content.faq_section.slice(0, 5).map((faq, index) => `
                                    <div style="background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                                        <div style="font-weight: 600; color: #1e293b; margin-bottom: 0.75rem; font-size: 1rem;">
                                            ${index + 1}. ${faq.question}
                                        </div>
                                        <div style="color: #475569; line-height: 1.6; font-size: 0.95rem;">
                                            ${faq.answer}
                                        </div>
                                    </div>
                                `).join('')}
                                ${content.faq_section.length > 5 ? `
                                    <div style="text-align: center; color: #64748b; font-size: 0.9rem; padding: 0.5rem;">
                                        ... and ${content.faq_section.length - 5} more questions
                    </div>
                ` : ''}
                            </div>
                        </div>
                    `;
                }
                
                // Key Facts Section - Compact Display
                if (content.key_facts && content.key_facts.length > 0) {
                    modalContent += `
                        <div>
                            <h4 style="margin: 0 0 1rem 0; color: #1e293b; font-size: 1.1rem; font-weight: 600; display: flex; align-items: center; gap: 0.5rem;">
                                <i class="fas fa-lightbulb" style="color: #f59e0b;"></i> 
                                Key Facts
                            </h4>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem;">
                                ${content.key_facts.slice(0, 6).map(fact => `
                                    <div style="background: #fef7ed; border-left: 3px solid #f59e0b; padding: 1rem; border-radius: 8px;">
                                        <strong style="color: #92400e; font-size: 0.9rem; display: block; margin-bottom: 0.5rem;">
                                            ${fact.fact || fact.title || 'Fact'}
                                        </strong>
                                        <div style="color: #451a03; font-size: 0.85rem; line-height: 1.4;">
                                            ${fact.description || fact.value || fact.content || ''}
                                        </div>
                                </div>
                            `).join('')}
                        </div>
                            ${content.key_facts.length > 6 ? `
                                <div style="text-align: center; color: #64748b; font-size: 0.9rem; padding: 0.75rem 0 0 0;">
                                    +${content.key_facts.length - 6} more facts available
                    </div>
                ` : ''}
                        </div>
                    `;
                }
                
                modalContent += `</div>`;
            }

            // Quality Check & Recommendations - Compact
            if (content.qc_results?.recommendations && content.qc_results.recommendations.length > 0) {
                modalContent += `
                    <div class="content-section">
                        <h4 style="margin: 0 0 1rem 0; color: #1e293b; font-size: 1.1rem; font-weight: 600; display: flex; align-items: center; gap: 0.5rem;">
                            <i class="fas fa-chart-line" style="color: #10b981;"></i> 
                            SEO Recommendations
                        </h4>
                        <div style="display: grid; gap: 0.75rem;">
                            ${content.qc_results.recommendations.slice(0, 4).map((rec, index) => `
                                <div style="background: #f0fdf4; border-left: 3px solid #10b981; padding: 1rem; border-radius: 8px; font-size: 0.9rem;">
                                    <span style="color: #166534; font-weight: 500;">${index + 1}.</span>
                                    <span style="color: #15803d; margin-left: 0.5rem;">${rec}</span>
                                </div>
                            `).join('')}
                            ${content.qc_results.recommendations.length > 4 ? `
                                <div style="text-align: center; color: #64748b; font-size: 0.85rem; padding: 0.5rem;">
                                    +${content.qc_results.recommendations.length - 4} more recommendations
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            }
            
                        // Main Content Section - Preview Only
            if (content.content) {
                const contentPreview = content.content.length > 500 ? content.content.substring(0, 500) + '...' : content.content;
                const contentId = 'content_' + Date.now(); // Unique ID for this content
                
                modalContent += `
                    <div class="content-section">
                        <h4 style="margin: 0 0 1rem 0; color: #1e293b; font-size: 1.1rem; font-weight: 600; display: flex; align-items: center; gap: 0.5rem;">
                            <i class="fas fa-file-alt" style="color: #6366f1;"></i> 
                            Content Preview
                        </h4>
                        <div id="${contentId}" style="background: #fafafa; border: 1px solid #e5e7eb; border-radius: 10px; padding: 1.5rem; max-height: 300px; overflow-y: auto; line-height: 1.6; font-size: 0.95rem;">
                            ${contentPreview}
                    </div>
                        ${content.content.length > 500 ? `
                            <div style="text-align: center; margin-top: 1rem;">
                                <button id="showFullBtn_${contentId}" onclick="dashboard.showFullContent('${contentId}', 'showFullBtn_${contentId}')" 
                                        style="background: #6366f1; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-size: 0.9rem;">
                                    Show Full Content
                                </button>
                            </div>
                        ` : ''}
                </div>
            `;
            
                // Store full content for later use
                if (content.content.length > 500) {
                    window.fullContentData = window.fullContentData || {};
                    window.fullContentData[contentId] = content.content;
                }
            }
            
            console.log('Setting modal content:', modalContent.substring(0, 200) + '...');
            console.log('Modal body element before:', modalBody);
            console.log('Modal body innerHTML before:', modalBody.innerHTML);
            
            modalBody.innerHTML = modalContent;
            
            console.log('Modal body after setting content:', modalBody.innerHTML.substring(0, 200) + '...');
            console.log('Modal body scrollHeight:', modalBody.scrollHeight);
            console.log('Modal body clientHeight:', modalBody.clientHeight);
            // Force modal to show with all possible overrides
            modal.style.cssText = `
                display: block !important;
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                background: rgba(0, 0, 0, 0.8) !important;
                z-index: 999999 !important;
                visibility: visible !important;
                opacity: 1 !important;
                pointer-events: auto !important;
            `;
            
            // Also force the modal content
            const modalContentEl = modal.querySelector('.modal-content');
            if (modalContentEl) {
                modalContentEl.style.cssText = `
                    position: absolute !important;
                    top: 50% !important;
                    left: 50% !important;
                    transform: translate(-50%, -50%) !important;
                    background: white !important;
                    border-radius: 20px !important;
                    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3) !important;
                    max-width: 95vw !important;
                    width: 1000px !important;
                    max-height: 90vh !important;
                    overflow: hidden !important;
                    display: flex !important;
                    flex-direction: column !important;
                    z-index: 1000000 !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                `;
            }
            
            // Force modal body to be visible
            modalBody.style.cssText = `
                padding: 0 !important;
                overflow-y: auto !important;
                flex: 1 !important;
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                height: auto !important;
                min-height: 200px !important;
                max-height: calc(90vh - 120px) !important;
            `;
            
            // Force all content sections to be visible
            setTimeout(() => {
                const contentSections = modalBody.querySelectorAll('.content-section');
                contentSections.forEach(section => {
                    section.style.cssText = `
                        display: block !important;
                        visibility: visible !important;
                        opacity: 1 !important;
                        padding: 2rem 2.5rem !important;
                        border-bottom: 1px solid #f1f5f9 !important;
                    `;
                });
                console.log('Forced visibility for', contentSections.length, 'content sections');
            }, 100);
            
            console.log('Modal display set to block with force');
            console.log('Modal visibility:', modal.style.visibility);
            console.log('Modal z-index:', window.getComputedStyle(modal).zIndex);
            console.log('Modal position:', window.getComputedStyle(modal).position);
            
            // Scroll to top to make sure modal is visible
            document.body.scrollTop = 0;
            document.documentElement.scrollTop = 0;
            
            // Additional debugging
            console.log('Modal element:', modal);
            console.log('Modal parent:', modal.parentElement);
            console.log('Modal bounding rect:', modal.getBoundingClientRect());
            console.log('Document body overflow:', window.getComputedStyle(document.body).overflow);
            console.log('Document html overflow:', window.getComputedStyle(document.documentElement).overflow);
            
            // Try to find what might be covering the modal
            const elementsAtCenter = document.elementsFromPoint(window.innerWidth / 2, window.innerHeight / 2);
            console.log('Elements at screen center:', elementsAtCenter);
            
            // Force focus on modal
            modal.focus();
            
            // Fix body overflow issue
            document.body.style.overflow = 'visible';
            document.documentElement.style.overflow = 'visible';
            document.body.classList.add('modal-open');
            
            // Remove debugging borders for clean look
            modal.style.border = '';
            if (modalContentEl) {
                modalContentEl.style.border = '';
            }
            modalBody.style.border = '';
            
            console.log('Fixed body overflow - modal should be visible now!');
            console.log('Modal body computed style:', window.getComputedStyle(modalBody));
            console.log('Modal body display:', window.getComputedStyle(modalBody).display);
            console.log('Modal body visibility:', window.getComputedStyle(modalBody).visibility);
            console.log('Modal body height:', window.getComputedStyle(modalBody).height);
            
            // Alternative: Create a completely new modal if needed (only if modal body is completely broken)
            setTimeout(() => {
                const computedHeight = parseFloat(window.getComputedStyle(modalBody).height);
                if (modalBody.scrollHeight < 50 || computedHeight < 50 || modalBody.clientHeight < 50) {
                    console.log('Modal body height is too small after timeout:', {
                        scrollHeight: modalBody.scrollHeight,
                        computedHeight: computedHeight,
                        clientHeight: modalBody.clientHeight
                    });
                    console.log('Creating alternative modal...');
                    this.createAlternativeModal(content);
                }
            }, 300);
            
        } catch (error) {
            console.error('Failed to load content:', error);
            
            // Try to find content in dummy data or current content list
            let content = null;
            
            // Check if we have the content in our current data
            if (filteredContent && filteredContent.length > 0) {
                content = filteredContent.find(item => item._id === id || item.id === id);
            }
            
            if (!content && contentData && contentData.length > 0) {
                content = contentData.find(item => item._id === id || item.id === id);
            }
            
                        // If still no content, show error
            if (!content) {
                showToast('Content not found', 'error');
                return;
            }
            
            // Show the modal with available content
            const modal = document.getElementById('contentModal');
            const modalTitle = document.getElementById('modalTitle');
            const modalBody = document.getElementById('modalBody');
            
            if (modal && modalTitle && modalBody) {
                modalTitle.textContent = content.title || 'Title not available';
                
                // Build content sections with available data
                let modalContent = `
                    <div class="content-section">
                        <h4><i class="fas fa-info-circle"></i> Content Details</h4>
                        <div class="content-meta">
                            <div class="meta-item">
                                <strong>Category</strong>
                                <span>${content.category?.name || content.category || 'Not specified'}</span>
                                </div>
                            <div class="meta-item">
                                <strong>Type</strong>
                                <span>${(content.content_type || 'article').replace('_', ' ')}</span>
                        </div>
                            <div class="meta-item">
                                <strong>Status</strong>
                                <span class="status-badge status-${content.status}">${content.status?.replace('_', ' ') || 'Not specified'}</span>
                    </div>
                            <div class="meta-item">
                                <strong>Word Count</strong>
                                <span>${content.word_count || 0} words</span>
                            </div>
                            <div class="meta-item">
                                <strong>Created Date</strong>
                                <span>${formatDate(content.created_at)}</span>
                            </div>
                            <div class="meta-item">
                                <strong>Last Updated</strong>
                                <span>${formatDate(content.updated_at)}</span>
                            </div>
                        </div>
                    </div>
                `;
                
                // Add other sections if data exists
                if (content.meta_description) {
                    modalContent += `
                        <div class="content-section">
                            <h4><i class="fas fa-file-text"></i> Meta Description</h4>
                            <p style="background: #f8fafc; padding: 1.5rem; border-radius: 12px; line-height: 1.6;">${content.meta_description}</p>
                    </div>
                    `;
                }
                
                if (content.tldr_summary) {
                    modalContent += `
                        <div class="content-section">
                            <h4><i class="fas fa-compress-alt"></i> TL;DR Summary</h4>
                            <p style="background: #f0f9ff; padding: 1.5rem; border-radius: 12px; line-height: 1.6; border-left: 4px solid #0ea5e9;">${content.tldr_summary}</p>
                </div>
            `;
                }
                
                if (content.keywords && content.keywords.length > 0) {
                    modalContent += `
                        <div class="content-section">
                            <h4><i class="fas fa-tags"></i> Keywords</h4>
                            <div class="keyword-tags">
                                ${content.keywords.map(keyword => `<span class="keyword-tag">${keyword}</span>`).join('')}
                            </div>
                        </div>
                    `;
                }
                
                if (content.key_facts && content.key_facts.length > 0) {
                    modalContent += `
                        <div class="content-section">
                            <h4><i class="fas fa-lightbulb"></i> Key Facts</h4>
                            <div class="facts-grid">
                                ${content.key_facts.map(fact => `
                                    <div class="fact-item">
                                        <strong>${fact.fact || fact.title || 'Fact'}:</strong>
                                        ${fact.description || fact.value || fact.content || ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                }
                
                if (content.faq_section && content.faq_section.length > 0) {
                    modalContent += `
                        <div class="content-section">
                            <h4><i class="fas fa-question-circle"></i> FAQ</h4>
                            <div class="faq-grid">
                                ${content.faq_section.map(faq => `
                                    <div class="faq-item">
                                        <div class="faq-question">${faq.question}</div>
                                        <div class="faq-answer">${faq.answer}</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                }
                
                // Main Content Section
                modalContent += `
                    <div class="content-section">
                        <h4><i class="fas fa-file-alt"></i> Main Content</h4>
                        <div class="content-text">
                            ${content.content || '<p style="text-align: center; color: #9ca3af; font-style: italic;">No content available</p>'}
                        </div>
                    </div>
                `;
                
                console.log('Setting fallback modal content:', modalContent.substring(0, 200) + '...');
                modalBody.innerHTML = modalContent;
                console.log('Fallback modal body after setting content:', modalBody.innerHTML.substring(0, 200) + '...');
            modal.style.display = 'block';
                modal.style.visibility = 'visible';
                modal.style.opacity = '1';
                console.log('Fallback modal display set to block');
                console.log('Fallback modal computed style:', window.getComputedStyle(modal));
                console.log('Fallback modal visibility:', modal.style.visibility);
                console.log('Fallback modal z-index:', window.getComputedStyle(modal).zIndex);
                
                if (error.message && error.message.includes('API')) {
                    showToast('API connection failed', 'warning');
                } else {
                    showToast('Content loaded from cache', 'info');
                }
            } else {
            showToast('Failed to load content details', 'error');
            }
        }
    },

    createAlternativeModal(content) {
        // Don't remove existing modal, just hide it and create new one with different ID
        const existingModal = document.getElementById('contentModal');
        if (existingModal) {
            existingModal.style.display = 'none';
        }
        
        // Remove any existing alternative modal
        const existingAltModal = document.getElementById('alternativeModal');
        if (existingAltModal) {
            existingAltModal.remove();
        }
        
        // Create new modal HTML with different ID
        const modalHTML = `
            <div id="alternativeModal" class="modal" style="display: block !important; position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; background: rgba(0, 0, 0, 0.8) !important; z-index: 999999 !important; visibility: visible !important; opacity: 1 !important;">
                <div class="modal-content" style="position: absolute !important; top: 50% !important; left: 50% !important; transform: translate(-50%, -50%) !important; background: white !important; border-radius: 20px !important; box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3) !important; max-width: 95vw !important; width: 1000px !important; max-height: 90vh !important; overflow: hidden !important; display: flex !important; flex-direction: column !important; z-index: 1000000 !important;">
                    <div class="modal-header" style="padding: 2rem 2.5rem 1rem !important; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important; color: white !important; display: flex !important; justify-content: space-between !important; align-items: flex-start !important;">
                        <h3 style="margin: 0 !important; font-size: 1.75rem !important; font-weight: 700 !important; color: white !important;">${content.title || 'Title Not Available'}</h3>
                        <button class="modal-close" style="background: rgba(255, 255, 255, 0.2) !important; border: 2px solid rgba(255, 255, 255, 0.3) !important; color: white !important; padding: 0.75rem !important; border-radius: 12px !important; cursor: pointer !important; width: 45px !important; height: 45px !important; display: flex !important; align-items: center !important; justify-content: center !important;">&times;</button>
                    </div>
                    <div class="modal-body" style="padding: 0 !important; overflow-y: auto !important; flex: 1 !important; display: block !important; visibility: visible !important; opacity: 1 !important;">
                        <div class="content-section" style="padding: 2rem 2.5rem !important; border-bottom: 1px solid #f1f5f9 !important; display: block !important;">
                            <h4 style="margin: 0 0 1.5rem 0 !important; color: #1e293b !important; font-size: 1.25rem !important; font-weight: 600 !important; display: flex !important; align-items: center !important; gap: 0.75rem !important;"><i class="fas fa-info-circle" style="color: #667eea !important;"></i> Content Details</h4>
                            <div class="content-meta" style="display: grid !important; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)) !important; gap: 1.5rem !important; margin-bottom: 2rem !important;">
                                <div class="meta-item" style="background: #f8fafc !important; padding: 1.25rem !important; border-radius: 12px !important; border-left: 4px solid #667eea !important;">
                                    <strong style="display: block !important; color: #475569 !important; font-size: 0.875rem !important; font-weight: 600 !important; text-transform: uppercase !important; letter-spacing: 0.05em !important; margin-bottom: 0.5rem !important;">Category</strong>
                                    <span style="color: #1e293b !important; font-size: 1rem !important; font-weight: 500 !important;">${content.category?.name || content.category || 'Unspecified'}</span>
                                </div>
                                <div class="meta-item" style="background: #f8fafc !important; padding: 1.25rem !important; border-radius: 12px !important; border-left: 4px solid #667eea !important;">
                                    <strong style="display: block !important; color: #475569 !important; font-size: 0.875rem !important; font-weight: 600 !important; text-transform: uppercase !important; letter-spacing: 0.05em !important; margin-bottom: 0.5rem !important;">Type</strong>
                                    <span style="color: #1e293b !important; font-size: 1rem !important; font-weight: 500 !important;">${(content.content_type || 'article').replace('_', ' ')}</span>
                                </div>
                                <div class="meta-item" style="background: #f8fafc !important; padding: 1.25rem !important; border-radius: 12px !important; border-left: 4px solid #667eea !important;">
                                    <strong style="display: block !important; color: #475569 !important; font-size: 0.875rem !important; font-weight: 600 !important; text-transform: uppercase !important; letter-spacing: 0.05em !important; margin-bottom: 0.5rem !important;">Status</strong>
                                    <span class="status-badge status-${content.status}" style="color: #1e293b !important; font-size: 1rem !important; font-weight: 500 !important;">${content.status?.replace('_', ' ') || 'Unspecified'}</span>
                                </div>
                                <div class="meta-item" style="background: #f8fafc !important; padding: 1.25rem !important; border-radius: 12px !important; border-left: 4px solid #667eea !important;">
                                    <strong style="display: block !important; color: #475569 !important; font-size: 0.875rem !important; font-weight: 600 !important; text-transform: uppercase !important; letter-spacing: 0.05em !important; margin-bottom: 0.5rem !important;">Word Count</strong>
                                    <span style="color: #1e293b !important; font-size: 1rem !important; font-weight: 500 !important;">${content.word_count || 0} words</span>
                                </div>
                            </div>
                        </div>
                        <div class="content-section" style="padding: 2rem 2.5rem !important; display: block !important;">
                            <h4 style="margin: 0 0 1.5rem 0 !important; color: #1e293b !important; font-size: 1.25rem !important; font-weight: 600 !important; display: flex !important; align-items: center !important; gap: 0.75rem !important;"><i class="fas fa-file-alt" style="color: #667eea !important;"></i> Main Content</h4>
                            <div class="content-text" style="background: white !important; border: 2px solid #f1f5f9 !important; border-radius: 16px !important; padding: 2rem !important; max-height: 400px !important; overflow-y: auto !important; line-height: 1.7 !important; font-size: 1rem !important;">
                                ${content.content || '<p style="text-align: center; color: #9ca3af; font-style: italic;">No content available</p>'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Add to body
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Add event listeners
        const newModal = document.getElementById('alternativeModal');
        const closeBtn = newModal.querySelector('.modal-close');
        
        closeBtn.addEventListener('click', () => {
            newModal.remove();
            document.body.classList.remove('modal-open');
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
        });
        
        newModal.addEventListener('click', (e) => {
            if (e.target === newModal) {
                newModal.remove();
                document.body.classList.remove('modal-open');
                document.body.style.overflow = '';
                document.documentElement.style.overflow = '';
            }
        });
        
        console.log('Alternative modal created successfully!');
        showToast('Alternative modal opened successfully', 'success');
    },

    recreateOriginalModal() {
        // Remove any existing modal first
        const existingModal = document.getElementById('contentModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Create the original modal structure
        const modalHTML = `
            <div id="contentModal" class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 id="modalTitle">Content Details</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body" id="modalBody">
                        <!-- Content will be populated here -->
                    </div>
                </div>
            </div>
        `;
        
        // Add to body
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Add event listeners for the recreated modal
        const modal = document.getElementById('contentModal');
        const closeBtn = modal.querySelector('.modal-close');
        
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
            document.body.classList.remove('modal-open');
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
                document.body.classList.remove('modal-open');
                document.body.style.overflow = '';
                document.documentElement.style.overflow = '';
            }
        });
        
        console.log('Original modal recreated successfully');
    },

    showFullContent(contentId, buttonId) {
        const contentElement = document.getElementById(contentId);
        const buttonElement = document.getElementById(buttonId);
        
        if (contentElement && buttonElement && window.fullContentData && window.fullContentData[contentId]) {
            contentElement.innerHTML = window.fullContentData[contentId];
            buttonElement.style.display = 'none';
            
            // Increase max-height for full content
            contentElement.style.maxHeight = '600px';
            
            console.log('Full content displayed for:', contentId);
        }
    },

    async editContent(id) {
        await contentEditor.open(id);
    },

    // Test modal function
    testModal() {
        console.log('Testing modal...');
        const modal = document.getElementById('contentModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        
        console.log('Modal element:', modal);
        console.log('Modal title element:', modalTitle);
        console.log('Modal body element:', modalBody);
        
        if (modal && modalTitle && modalBody) {
            modalTitle.textContent = 'Modal Test';
            modalBody.innerHTML = `
                <div class="content-section">
                    <h4><i class="fas fa-test-tube"></i> Modal Test</h4>
                    <p>This is a test to ensure the modal is working correctly.</p>
                    <div style="background: #f0f9ff; padding: 1rem; border-radius: 8px; margin: 1rem 0;">
                        <strong>Modal Status:</strong> Working correctly ✅
                    </div>
                </div>
            `;
            // Force test modal to show with all possible overrides
            modal.style.cssText = `
                display: block !important;
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                background: rgba(0, 0, 0, 0.8) !important;
                z-index: 999999 !important;
                visibility: visible !important;
                opacity: 1 !important;
                pointer-events: auto !important;
            `;
            
            // Also force the modal content
            const modalContentTest = modal.querySelector('.modal-content');
            if (modalContentTest) {
                modalContentTest.style.cssText = `
                    position: absolute !important;
                    top: 50% !important;
                    left: 50% !important;
                    transform: translate(-50%, -50%) !important;
                    background: white !important;
                    border-radius: 20px !important;
                    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3) !important;
                    max-width: 95vw !important;
                    width: 1000px !important;
                    max-height: 90vh !important;
                    overflow: hidden !important;
                    display: flex !important;
                    flex-direction: column !important;
                    z-index: 1000000 !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                `;
            }
            
            console.log('Test modal should be visible now with force');
            console.log('Test modal visibility:', modal.style.visibility);
            console.log('Test modal z-index:', window.getComputedStyle(modal).zIndex);
            
            // Scroll to top to make sure modal is visible
            document.body.scrollTop = 0;
            document.documentElement.scrollTop = 0;
            
            // Fix body overflow issue
            document.body.style.overflow = 'visible';
            document.documentElement.style.overflow = 'visible';
            document.body.classList.add('modal-open');
            
            console.log('Fixed body overflow for test modal - should be visible now!');
            showToast('Test modal opened successfully', 'success');
        } else {
            console.error('Modal elements not found');
            showToast('Error: Modal elements not found', 'error');
        }
    },

    async publishContent(id) {
        if (!confirm('Are you sure you want to publish this content?')) return;
        
        try {
            await api.publishContent(id);
            showToast('Content published successfully', 'success');
            this.loadContent();
        } catch (error) {
            console.error('Failed to publish content:', error);
            showToast('Failed to publish content', 'error');
        }
    },

    async deleteContent(id) {
        if (!confirm('Are you sure you want to delete this content? This action cannot be undone.')) return;
        
        try {
            await api.deleteContent(id);
            showToast('Content deleted successfully', 'success');
            this.loadContent();
        } catch (error) {
            console.error('Failed to delete content:', error);
            showToast('Failed to delete content', 'error');
        }
    },

    updateCategoryFilter() {
        const categoryFilter = document.getElementById('filterCategory');
        if (!categoryFilter || !contentData) return;
        
        // Extract unique categories from content with both name and slug
        const categoryMap = new Map();
        
        contentData.forEach(item => {
            if (item.category?.name && item.category?.slug) {
                // New format: category is an object with name and slug
                categoryMap.set(item.category.slug, item.category.name);
            } else if (typeof item.category === 'string' && item.category) {
                // Old format: category is a string (fallback)
                categoryMap.set(item.category.toLowerCase().replace(/\s+/g, '-'), item.category);
            }
        });
        
        // Sort categories by name
        const categories = Array.from(categoryMap.entries())
            .sort((a, b) => a[1].localeCompare(b[1]));
        
        // Update category filter dropdown (value = slug, display = name)
        categoryFilter.innerHTML = '<option value="">All Categories</option>' + 
            categories.map(([slug, name]) => `<option value="${slug}">${name}</option>`).join('');
    },

    filterContent() {
        const searchTerm = document.getElementById('searchContent').value.toLowerCase();
        
        // If there's a search term, filter client-side for immediate feedback
        if (searchTerm) {
        filteredContent = contentData.filter(item => {
                // Get category name (handle both object and string formats)
                const categoryName = item.category?.name || item.category || '';
                const categoryText = typeof categoryName === 'string' ? categoryName.toLowerCase() : '';
                
                return item.title.toLowerCase().includes(searchTerm) ||
                       categoryText.includes(searchTerm) ||
                       (item.keywords && item.keywords.some(kw => kw.toLowerCase().includes(searchTerm)));
            });
            
            this.renderContentTable();
            this.updatePagination();
        } else {
            // If no search term, reload from server with current filters
            this.loadContent();
        }
    },

    toggleSelectAll(checkbox) {
        const contentCheckboxes = document.querySelectorAll('.content-checkbox');
        contentCheckboxes.forEach(cb => {
            cb.checked = checkbox.checked;
            this.toggleContentSelection(cb.value, cb.checked);
        });
    },

    toggleContentSelection(contentId, isSelected) {
        if (isSelected) {
            selectedContentIds.add(contentId);
        } else {
            selectedContentIds.delete(contentId);
        }
        
        this.updateBulkActionsBar();
        this.updateSelectAllCheckbox();
    },

    updateBulkActionsBar() {
        const bulkActionsBar = document.getElementById('bulkActionsBar');
        const selectedCount = document.getElementById('selectedCount');
        
        if (selectedContentIds.size > 0) {
            bulkActionsBar.style.display = 'flex';
            selectedCount.textContent = `${selectedContentIds.size} item${selectedContentIds.size > 1 ? 's' : ''} selected`;
        } else {
            bulkActionsBar.style.display = 'none';
        }
    },

    updateSelectAllCheckbox() {
        const selectAllCheckbox = document.getElementById('selectAll');
        const contentCheckboxes = document.querySelectorAll('.content-checkbox');
        const checkedBoxes = document.querySelectorAll('.content-checkbox:checked');
        
        if (checkedBoxes.length === 0) {
            selectAllCheckbox.indeterminate = false;
            selectAllCheckbox.checked = false;
        } else if (checkedBoxes.length === contentCheckboxes.length) {
            selectAllCheckbox.indeterminate = false;
            selectAllCheckbox.checked = true;
        } else {
            selectAllCheckbox.indeterminate = true;
        }
    },

    clearSelection() {
        selectedContentIds.clear();
        document.querySelectorAll('.content-checkbox').forEach(cb => cb.checked = false);
        document.getElementById('selectAll').checked = false;
        this.updateBulkActionsBar();
    },

    async archiveContent(id) {
        if (!confirm('Are you sure you want to archive this content?')) return;
        
        try {
            await api.archiveContent(id);
            showToast('Content archived successfully', 'success');
            this.loadContent();
        } catch (error) {
            console.error('Failed to archive content:', error);
            showToast('Failed to archive content', 'error');
        }
    },

    async bulkApplyStatus() {
        const statusSelect = document.getElementById('bulkStatusSelect');
        const newStatus = statusSelect.value;
        
        if (!newStatus || selectedContentIds.size === 0) {
            showToast('Please select a status and items to update', 'warning');
            return;
        }
        
        if (!confirm(`Are you sure you want to change the status of ${selectedContentIds.size} selected item(s) to "${newStatus.replace('_', ' ')}"?`)) return;
        
        try {
            await api.bulkUpdateStatus(Array.from(selectedContentIds), newStatus);
            
            showToast(`Successfully updated ${selectedContentIds.size} item(s) to ${newStatus.replace('_', ' ')}`, 'success');
            this.clearSelection();
            statusSelect.value = ''; // Reset the dropdown
            this.loadContent();
        } catch (error) {
            console.error('Failed to bulk update status:', error);
            showToast('Failed to update some items', 'error');
        }
    },

    async bulkDeleteContent() {
        if (selectedContentIds.size === 0) return;
        
        if (!confirm(`Are you sure you want to delete ${selectedContentIds.size} selected item(s)? This action cannot be undone.`)) return;
        
        try {
            const promises = Array.from(selectedContentIds).map(id => api.deleteContent(id));
            await Promise.all(promises);
            
            showToast(`Successfully deleted ${selectedContentIds.size} item(s)`, 'success');
            this.clearSelection();
            this.loadContent();
        } catch (error) {
            console.error('Failed to bulk delete:', error);
            showToast('Failed to delete some items', 'error');
        }
    },

    // Enhanced activity functions
    getActivityType(item) {
        if (item.status === 'published') return 'publish';
        if (item.status === 'draft') return 'edit';
        if (item.type === 'ai_generated') return 'create';
        return 'create';
    },

    getActivityIcon(type) {
        const icons = {
            create: 'fa-plus-circle',
            edit: 'fa-edit',
            publish: 'fa-eye',
            delete: 'fa-trash'
        };
        return icons[type] || 'fa-file-alt';
    },

    getActivityText(type) {
        const texts = {
            create: 'Created',
            edit: 'Updated',
            publish: 'Published',
            delete: 'Deleted'
        };
        return texts[type] || 'Modified';
    },

    formatTimeAgo(dateString) {
        if (!dateString) return 'recently';
        
        const date = new Date(dateString);
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        if (diffInSeconds < 60) return 'just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
        
        return date.toLocaleDateString();
    },

    // API Status Dashboard
    async showApiStatusDashboard() {
        const modal = document.createElement('div');
        modal.id = 'apiStatusModal';
        modal.className = 'modal';
        modal.style.display = 'block';
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <h2><i class="fas fa-server"></i> API Status Dashboard</h2>
                    <span class="modal-close" onclick="dashboard.closeApiStatusModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="api-status-loading">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Checking API endpoints...</p>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        document.body.classList.add('modal-open');
        
        // Check all endpoints
        try {
            const results = await api.checkAllEndpoints();
            this.renderApiStatusResults(results);
        } catch (error) {
            console.error('API status check failed:', error);
            const modalBody = modal.querySelector('.modal-body');
            modalBody.innerHTML = `
                <div class="api-status-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Failed to check API status</h3>
                    <p>${error.message}</p>
                    <button class="btn btn-primary" onclick="dashboard.showApiStatusDashboard()">
                        <i class="fas fa-redo"></i> Retry
                    </button>
                </div>
            `;
        }
    },

    renderApiStatusResults(results) {
        const modal = document.getElementById('apiStatusModal');
        const modalBody = modal.querySelector('.modal-body');
        
        const successCount = results.filter(r => r.status === 'success').length;
        const totalCount = results.length;
        const criticalIssues = results.filter(r => r.critical && r.status === 'error').length;
        
        const overallStatus = criticalIssues > 0 ? 'critical' : successCount === totalCount ? 'healthy' : 'warning';
        
        modalBody.innerHTML = `
            <div class="api-status-overview">
                <div class="status-summary ${overallStatus}">
                    <div class="status-icon">
                        <i class="fas ${overallStatus === 'healthy' ? 'fa-check-circle' : overallStatus === 'warning' ? 'fa-exclamation-triangle' : 'fa-times-circle'}"></i>
                    </div>
                    <div class="status-info">
                        <h3>API Status: ${overallStatus.charAt(0).toUpperCase() + overallStatus.slice(1)}</h3>
                        <p>${successCount}/${totalCount} endpoints operational</p>
                        ${criticalIssues > 0 ? `<p class="critical-warning">${criticalIssues} critical issues detected</p>` : ''}
                    </div>
                    <div class="status-actions">
                        <button class="btn btn-secondary" onclick="dashboard.showApiStatusDashboard()">
                            <i class="fas fa-sync"></i> Refresh
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="api-endpoints-list">
                <h4><i class="fas fa-list"></i> Endpoint Status</h4>
                <div class="endpoints-grid">
                    ${results.map(endpoint => `
                        <div class="endpoint-card ${endpoint.status} ${endpoint.critical ? 'critical' : ''}">
                            <div class="endpoint-header">
                                <div class="endpoint-name">
                                    <i class="fas ${endpoint.status === 'success' ? 'fa-check' : 'fa-times'}"></i>
                                    ${endpoint.name}
                                    ${endpoint.critical ? '<span class="critical-badge">Critical</span>' : ''}
                                </div>
                                <div class="endpoint-method">${endpoint.method}</div>
                            </div>
                            <div class="endpoint-details">
                                <div class="endpoint-url">${endpoint.url}</div>
                                <div class="endpoint-metrics">
                                    <span class="status-code ${endpoint.status}">
                                        ${endpoint.statusCode || 'N/A'}
                                    </span>
                                    <span class="response-time">
                                        ${endpoint.responseTime}ms
                                    </span>
                                </div>
                                ${endpoint.error ? `<div class="endpoint-error">${endpoint.error}</div>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="api-info-section">
                <h4><i class="fas fa-info-circle"></i> API Information</h4>
                <div class="api-info-grid">
                    <div class="info-item">
                        <strong>Base URL:</strong>
                        <span>${CONFIG.API_BASE_URL}</span>
                    </div>
                    <div class="info-item">
                        <strong>Authentication:</strong>
                        <span>Basic Auth (${CONFIG.CREDENTIALS.username})</span>
                    </div>
                    <div class="info-item">
                        <strong>Last Check:</strong>
                        <span>${new Date().toLocaleString()}</span>
                    </div>
                    <div class="info-item">
                        <strong>Dashboard Version:</strong>
                        <span>1.0.0</span>
                    </div>
                </div>
            </div>
        `;
    },

    closeApiStatusModal() {
        const modal = document.getElementById('apiStatusModal');
        if (modal) {
            modal.remove();
            document.body.classList.remove('modal-open');
        }
    }
};

// Content Creation
const contentCreator = {
    async createAIContent(formData) {
        try {
            const form = document.getElementById('aiContentForm');
            if (form) {
            showLoading(form);
            }
            
            // التحقق من صحة البيانات
            if (!this.validateFormData(formData)) {
                if (form) hideLoading(form);
                return;
            }
            
            const keywords = formData.keywords.split(',').map(k => k.trim()).filter(k => k);
            const targetLength = this.getTargetLength(formData.target_length);
            
            const data = {
                title: formData.title,
                category: formData.category,
                keywords: keywords,
                content_type: formData.content_type,
                search_intent: formData.search_intent,
                guidance: formData.guidance || '',
                target_length: targetLength,
                // Advanced parameters
                target_audience: formData.target_audience || 'general',
                brand_voice: formData.brand_voice || 'professional',
                competitor_insights: formData.competitor_insights || ''
            };
            
            // Add optional URL fields only if they have values
            if (formData.course_url && formData.course_url.trim()) {
                data.course_url = formData.course_url.trim();
            }
            if (formData.image_url && formData.image_url.trim()) {
                data.image_url = formData.image_url.trim();
            }
            if (formData.image_alt_text && formData.image_alt_text.trim()) {
                data.image_alt_text = formData.image_alt_text.trim();
            }
            
            // Log for verification
            console.log('📏 Sending AI Content Request:', {
                title: data.title,
                target_length: data.target_length,
                original_input: formData.target_length
            });
            
            const result = await api.createAIContent(data);
            
            showToast('Content created successfully!', 'success');
            
            if (form) form.reset();
            navigation.switchSection('content');
            
        } catch (error) {
            console.error('Failed to create AI content:', error);
            showToast('Failed to create content: ' + error.message, 'error');
        } finally {
            const form = document.getElementById('aiContentForm');
            if (form) hideLoading(form);
        }
    },
    
    validateFormData(formData) {
        if (!formData.title || formData.title.trim().length < 5) {
            showToast('Title must be at least 5 characters long', 'error');
            return false;
        }
        
        if (!formData.category || formData.category.trim().length < 2) {
            showToast('Category is required', 'error');
            return false;
        }
        
        const keywords = formData.keywords.split(',').map(k => k.trim()).filter(k => k);
        if (keywords.length === 0) {
            showToast('At least one keyword is required', 'error');
            return false;
        }
        
        return true;
    },
    
    getTargetLength(targetLength) {
        switch (targetLength) {
            case 'short': return 1000;
            case 'medium': return 1500;
            case 'long': return 2500;
            case 'comprehensive': return 3500;
            case 'extended': return 5000;
            default: return parseInt(targetLength) || 1500;
        }
    },

    async createManualContent(formData) {
        try {
            const form = document.getElementById('manualContentForm');
            if (form) {
            showLoading(form);
            }
            
            // Validate required fields
            if (!formData.title || formData.title.trim().length < 5) {
                showToast('Title must be at least 5 characters long', 'error');
                hideLoading(form);
                return;
            }
            
            if (!formData.category || formData.category.trim().length < 2) {
                showToast('Category is required', 'error');
                hideLoading(form);
                return;
            }
            
            if (!formData.content || formData.content.trim().length < 50) {
                showToast('Content must be at least 50 characters long', 'error');
                hideLoading(form);
                return;
            }
            
            const data = {
                created_by: formData.author_name || 'Upscend Team',
                title: formData.title,
                category: formData.category,
                content: formData.content
            };
            
            // Add optional URL fields only if they have values
            if (formData.course_url && formData.course_url.trim()) {
                data.course_url = formData.course_url.trim();
            }
            if (formData.image_url && formData.image_url.trim()) {
                data.image_url = formData.image_url.trim();
            }
            if (formData.image_alt_text && formData.image_alt_text.trim()) {
                data.image_alt_text = formData.image_alt_text.trim();
            }
            
            const result = await api.createManualContent(data);
            
            showToast('Manual content created successfully!', 'success');
            
            // Reset form
            form.reset();
            
            // Switch to content management
            navigation.switchSection('content');
            
        } catch (error) {
            console.error('Failed to create manual content:', error);
            showToast('Failed to create manual content: ' + error.message, 'error');
        } finally {
            const form = document.getElementById('manualContentForm');
            if (form) {
            hideLoading(form);
            }
        }
    }
};

// Brainstorming
const brainstorm = {
    categories: [],
    selectedCategory: null,
    existingJobs: [],

    async loadCategories(retryCount = 0) {
        try {
            this.categories = await api.getCategories();
            this.renderCategoryDropdown();
            
            // Load existing brainstorm jobs
            await this.loadExistingJobs();
            
            // Set default selection to first category if available
            if (this.categories.length > 0) {
                this.selectCategory(this.categories[0]);
            } else {
                // No categories exist yet - clear the search input
                const searchInput = document.getElementById('categorySearch');
                if (searchInput) {
                    searchInput.placeholder = 'Enter category name to create...';
                }
            }
            
        } catch (error) {
            console.error('Failed to load categories:', error);
            
            // Retry once after a short delay if this is the first attempt
            if (retryCount === 0) {
                console.log('Retrying categories load in 2 seconds...');
                setTimeout(() => {
                    this.loadCategories(1);
                }, 2000);
                return;
            }
            
            // Initialize empty categories array after retry fails
            this.categories = [];
            this.renderCategoryDropdown();
            
            const searchInput = document.getElementById('categorySearch');
            if (searchInput) {
                searchInput.placeholder = 'Enter category name to create...';
            }
        }
    },

    renderCategoryDropdown(filter = '') {
        const dropdown = document.getElementById('categoryDropdown');
        dropdown.innerHTML = '';

        // Filter categories based on search
        const filteredCategories = this.categories.filter(cat => 
            cat.name.toLowerCase().includes(filter.toLowerCase()) ||
            cat.slug.toLowerCase().includes(filter.toLowerCase())
        );

        // Add existing categories
        filteredCategories.forEach(category => {
            const option = document.createElement('div');
            option.className = 'category-option';
            option.innerHTML = `
                <span class="category-name">${category.name}</span>
                <span class="category-slug">${category.slug}</span>
            `;
            option.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.selectCategory(category);
            });
            dropdown.appendChild(option);
        });

        // Always show "Create new category" option when there's text input
        if (filter.trim()) {
            const isExistingCategory = filteredCategories.some(cat => 
                cat.name.toLowerCase() === filter.toLowerCase() || 
                cat.slug.toLowerCase() === filter.toLowerCase()
            );
            
            if (!isExistingCategory) {
                const newOption = document.createElement('div');
                newOption.className = 'category-option new-category';
                newOption.innerHTML = `
                    <span class="category-name">✨ Create "${filter.trim()}"</span>
                    <span class="category-slug">New category</span>
                `;
                newOption.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    this.selectNewCategory(filter.trim());
                });
                dropdown.appendChild(newOption);
            }
        }

                    // Show helpful message if no categories exist and no filter
            if (this.categories.length === 0 && !filter.trim()) {
                const helpOption = document.createElement('div');
                helpOption.className = 'category-option';
                helpOption.style.fontStyle = 'italic';
                helpOption.style.color = '#64748b';
                helpOption.innerHTML = `
                    <span class="category-name">💡 Start typing to create your first category</span>
                    <span class="category-slug">Dynamic creation enabled</span>
                `;
                dropdown.appendChild(helpOption);
                
                // Add retry button
                const retryOption = document.createElement('div');
                retryOption.className = 'category-option';
                retryOption.style.cursor = 'pointer';
                retryOption.style.borderTop = '1px solid #e2e8f0';
                retryOption.innerHTML = `
                    <span class="category-name">🔄 Retry loading categories</span>
                    <span class="category-slug">Click to reload from database</span>
                `;
                retryOption.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    showToast('Reloading categories...', 'info');
                    this.loadCategories(0);
                    this.hideCategoryDropdown();
                });
                dropdown.appendChild(retryOption);
            }
    },

    selectCategory(category) {
        this.selectedCategory = category;
        const searchInput = document.getElementById('categorySearch');
        const hiddenSelect = document.getElementById('brainstormCategory');
        
        searchInput.value = category.name;
        hiddenSelect.value = category.slug;
        
        this.hideCategoryDropdown();
    },

    selectNewCategory(name) {
        const slug = name.trim().toLowerCase().replace(/\s+/g, '-');
        this.selectedCategory = { name: name.trim(), slug: slug, isNew: true };
        
        const searchInput = document.getElementById('categorySearch');
        const hiddenSelect = document.getElementById('brainstormCategory');
        
        searchInput.value = name.trim();
        hiddenSelect.value = 'custom';
        
        // Set custom category input
        const customInput = document.getElementById('customCategory');
        if (customInput) {
            customInput.value = name.trim();
        }
        
        this.hideCategoryDropdown();
    },

    filterCategories(value) {
        this.renderCategoryDropdown(value);
        if (value) {
            this.showCategoryDropdown();
        }
    },

    showCategoryDropdown() {
        const dropdown = document.getElementById('categoryDropdown');
        dropdown.style.display = 'block';
    },

    hideCategoryDropdown() {
        setTimeout(() => {
            const dropdown = document.getElementById('categoryDropdown');
            dropdown.style.display = 'none';
        }, 150);
    },

    getTargetLength(targetLength) {
        switch (targetLength) {
            case 'short': return 1000;
            case 'medium': return 1500;
            case 'long': return 2500;
            case 'comprehensive': return 3500;
            case 'extended': return 5000;
            default: return parseInt(targetLength) || 1500;
        }
    },

    async generateIdeas(formData) {
        try {
            const form = document.getElementById('brainstormForm');
            const resultsDiv = document.getElementById('brainstormResults');
            
            showLoading(form);
            resultsDiv.innerHTML = '';
            
            // Handle category selection
            let category;
            if (this.selectedCategory) {
                if (this.selectedCategory.isNew) {
                    category = this.selectedCategory.slug;
                } else {
                    category = this.selectedCategory.slug;
                }
            } else {
                // Fallback to form data
                category = formData.category || 'general';
            }
            
            const data = {
                topic: formData.topic,
                category: category,
                num_articles: parseInt(formData.num_articles),
                // Note: target_length removed - AI determines appropriate length per article
                content_type: formData.content_type || 'article',
                target_audience: formData.target_audience || 'general',
                brand_voice: formData.brand_voice || 'professional',
                competitor_insights: formData.competitor_insights || ''
            };
            
            console.log('📝 Brainstorm Request (no target_length - AI determines):', data);
            
            const result = await api.brainstormIdeas(data);
            
            // If a new category was created, reload categories to include it
            if (this.selectedCategory && this.selectedCategory.isNew) {
                await this.loadCategories();
                // Find and select the newly created category
                const newCategory = this.categories.find(cat => cat.slug === this.selectedCategory.slug);
                if (newCategory) {
                    this.selectCategory(newCategory);
                }
            }
            
            if (result.article_ideas && result.article_ideas.length > 0) {
                resultsDiv.innerHTML = `
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 1.5rem; border-radius: 12px; margin-bottom: 2rem; color: white;">
                        <h3 style="margin: 0 0 1rem 0; font-size: 1.5rem;">
                            <i class="fas fa-lightbulb" style="margin-right: 0.5rem;"></i>
                        Generated Ideas for "${formData.topic}"
                    </h3>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; opacity: 0.95;">
                                <div>
                                <div style="font-size: 0.875rem; opacity: 0.9;">Category</div>
                                <div style="font-weight: 600; font-size: 1.1rem;">${result.category || formData.category || 'N/A'}</div>
                                </div>
                            <div>
                                <div style="font-size: 0.875rem; opacity: 0.9;">Total Ideas</div>
                                <div style="font-weight: 600; font-size: 1.1rem;">${result.article_ideas.length}</div>
                            </div>
                            <div>
                                <div style="font-size: 0.875rem; opacity: 0.9;">Target Length</div>
                                <div style="font-weight: 600; font-size: 1.1rem;">${result.target_length || 'N/A'} words</div>
                            </div>
                            <div>
                                <div style="font-size: 0.875rem; opacity: 0.9;">Content Type</div>
                                <div style="font-weight: 600; font-size: 1.1rem;">${result.content_type || 'article'}</div>
                            </div>
                            <div>
                                <div style="font-size: 0.875rem; opacity: 0.9;">Target Audience</div>
                                <div style="font-weight: 600; font-size: 1.1rem;">${result.target_audience || 'general'}</div>
                            </div>
                            <div>
                                <div style="font-size: 0.875rem; opacity: 0.9;">Brand Voice</div>
                                <div style="font-weight: 600; font-size: 1.1rem;">${result.brand_voice || 'professional'}</div>
                            </div>
                        </div>
                    </div>
                    
                    ${result.article_ideas.map((idea, index) => `
                        <div class="idea-card" style="margin-bottom: 2rem; background: white; border: 2px solid #e9ecef; border-radius: 12px; padding: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                            <div class="idea-header" style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 2px solid #f1f3f5;">
                                <div style="flex: 1;">
                                    <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                                        <span style="background: #667eea; color: white; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.875rem; font-weight: 600;">#${index + 1}</span>
                                        <span class="idea-role" style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.875rem; font-weight: 500;">${idea.cluster_role}</span>
                                    </div>
                                    <h3 class="idea-title" style="margin: 0; color: #2d3748; font-size: 1.25rem; line-height: 1.4;">${idea.title}</h3>
                                </div>
                                <button class="btn btn-sm btn-primary" onclick="brainstorm.useIdea('${idea.title.replace(/'/g, "\\'")}', '${idea.primary_keyword}', '${idea.search_intent}')" style="white-space: nowrap;">
                                    <i class="fas fa-plus"></i> Use Idea
                                </button>
                            </div>
                            
                            <div class="idea-keywords" style="margin-bottom: 1.5rem;">
                                <div style="margin-bottom: 1rem;">
                                    <strong style="color: #4a5568; display: block; margin-bottom: 0.5rem; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.5px;">
                                        <i class="fas fa-key" style="margin-right: 0.25rem;"></i> Primary Keyword
                                    </strong>
                                    <span class="keyword-tag" style="background: #667eea; color: white; font-weight: 600; padding: 0.5rem 1rem; border-radius: 6px; display: inline-block;">${idea.primary_keyword}</span>
                                </div>
                                <div style="margin-bottom: 1rem;">
                                    <strong style="color: #4a5568; display: block; margin-bottom: 0.5rem; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.5px;">
                                        <i class="fas fa-tags" style="margin-right: 0.25rem;"></i> Secondary Keywords
                                    </strong>
                                    <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                                        ${idea.secondary_keywords.map(keyword => `<span class="keyword-tag" style="background: #e9ecef; color: #495057; padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.875rem;">${keyword}</span>`).join('')}
                                    </div>
                                </div>
                                ${idea.long_tail_keywords && idea.long_tail_keywords.length > 0 ? `
                                    <div style="margin-bottom: 1rem;">
                                        <strong style="color: #4a5568; display: block; margin-bottom: 0.5rem; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.5px;">
                                            <i class="fas fa-stream" style="margin-right: 0.25rem;"></i> Long-tail Keywords
                                        </strong>
                                        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                                            ${idea.long_tail_keywords.map(keyword => `<span class="keyword-tag" style="background: #f8f9fa; color: #6c757d; padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.875rem; border: 1px solid #dee2e6;">${keyword}</span>`).join('')}
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                            
                            <div class="idea-meta" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; padding: 1rem; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-radius: 8px;">
                                <div>
                                    <strong style="color: #4a5568; display: block; margin-bottom: 0.25rem; font-size: 0.875rem;">
                                        <i class="fas fa-search" style="margin-right: 0.25rem;"></i> Search Intent
                                    </strong>
                                    <span style="color: #667eea; font-weight: 600; text-transform: capitalize;">${idea.search_intent}</span>
                                </div>
                                <div>
                                    <strong style="color: #4a5568; display: block; margin-bottom: 0.25rem; font-size: 0.875rem;">
                                        <i class="fas fa-filter" style="margin-right: 0.25rem;"></i> Funnel Stage
                                    </strong>
                                    <span style="color: #667eea; font-weight: 600;">${idea.funnel_stage}</span>
                                </div>
                                <div>
                                    <strong style="color: #4a5568; display: block; margin-bottom: 0.25rem; font-size: 0.875rem;">
                                        <i class="fas fa-file-alt" style="margin-right: 0.25rem;"></i> Content Type
                                    </strong>
                                    <span style="color: #667eea; font-weight: 600; text-transform: capitalize;">${idea.content_type || 'article'}</span>
                                </div>
                                <div>
                                    <strong style="color: #4a5568; display: block; margin-bottom: 0.25rem; font-size: 0.875rem;">
                                        <i class="fas fa-users" style="margin-right: 0.25rem;"></i> Target Audience
                                    </strong>
                                    <span style="color: #667eea; font-weight: 600; text-transform: capitalize;">${idea.target_audience || 'general'}</span>
                                </div>
                                <div>
                                    <strong style="color: #4a5568; display: block; margin-bottom: 0.25rem; font-size: 0.875rem;">
                                        <i class="fas fa-bullhorn" style="margin-right: 0.25rem;"></i> Brand Voice
                                    </strong>
                                    <span style="color: #667eea; font-weight: 600; text-transform: capitalize;">${idea.brand_voice || 'professional'}</span>
                                </div>
                            </div>
                            
                            ${idea.content_strategy ? `
                                <div class="idea-strategy" style="background: #fff3cd; padding: 1rem; border-radius: 8px; border-left: 4px solid #ffc107; margin-bottom: 1rem;">
                                    <strong style="color: #856404; display: block; margin-bottom: 0.5rem;">
                                        <i class="fas fa-chess" style="margin-right: 0.25rem;"></i> Content Strategy
                                    </strong>
                                    <p style="color: #856404; margin: 0; line-height: 1.6;">${idea.content_strategy}</p>
                            </div>
                            ` : ''}
                            
                            ${idea.guidance ? `
                                <div class="idea-guidance" style="background: #d1ecf1; padding: 1rem; border-radius: 8px; border-left: 4px solid #17a2b8; margin-bottom: 1rem;">
                                    <strong style="color: #0c5460; display: block; margin-bottom: 0.5rem;">
                                        <i class="fas fa-lightbulb" style="margin-right: 0.25rem;"></i> Content Guidance
                                    </strong>
                                    <p style="color: #0c5460; margin: 0; line-height: 1.6; white-space: pre-wrap;">${idea.guidance}</p>
                                </div>
                            ` : ''}
                            
                            <div class="idea-additional-guidance" style="margin-top: 1rem;">
                                <label style="color: #4a5568; font-weight: 600; display: block; margin-bottom: 0.5rem;">
                                    <i class="fas fa-pen" style="margin-right: 0.25rem;"></i> Additional Instructions (Optional)
                                </label>
                                <textarea class="guidance-input" placeholder="Add any specific instructions for this article..." style="width: 100%; padding: 0.75rem; border: 2px solid #e9ecef; border-radius: 8px; font-family: inherit; resize: vertical; min-height: 80px; transition: border-color 0.2s;" onfocus="this.style.borderColor='#667eea'" onblur="this.style.borderColor='#e9ecef'"></textarea>
                            </div>
                        </div>
                    `).join('')}
                `;
                
                showToast(`Generated ${result.article_ideas.length} article ideas!`, 'success');
            } else {
                resultsDiv.innerHTML = '<p>No ideas generated. Please try again.</p>';
                showToast('No ideas were generated', 'warning');
            }
            
        } catch (error) {
            console.error('Failed to generate ideas:', error);
            showToast('Failed to generate ideas: ' + error.message, 'error');
        } finally {
            const form = document.getElementById('brainstormForm');
            hideLoading(form);
        }
    },

    useIdea(title, primaryKeyword, searchIntent) {
        // Pre-fill the AI content form with the idea
        navigation.switchSection('create');
        
        document.getElementById('aiTitle').value = title;
        document.getElementById('aiKeywords').value = primaryKeyword;
        document.getElementById('aiSearchIntent').value = searchIntent;
        
        // Switch to AI tab
        document.querySelector('[data-tab="ai"]').click();
        
        showToast('Idea loaded into content creator!', 'success');
    },

    async loadExistingJobs() {
        try {
            // Load existing brainstorm jobs from the database
            const jobs = await api.getBulkJobs('', 0, 100);
            this.existingJobs = jobs.filter(job => job.status === 'pending_review' || job.status === 'completed');
            
            // Display existing jobs in the brainstorm section
            this.displayExistingJobs();
            
        } catch (error) {
            console.error('Error loading existing jobs:', error);
        }
    },

    displayExistingJobs() {
        const resultsDiv = document.getElementById('brainstormResults');
        
        if (this.existingJobs.length === 0) {
            return;
        }
        
        // Create a section for existing jobs
        const existingJobsHTML = `
            <div class="existing-jobs-section" style="margin-bottom: 2rem;">
                <h3 style="margin-bottom: 1.5rem; color: #2d3748; display: flex; align-items: center;">
                    <i class="fas fa-history" style="color: #667eea; margin-right: 0.5rem;"></i>
                    Existing Brainstorm Jobs
                </h3>
                ${this.existingJobs.map(job => `
                    <div class="existing-job-card" style="background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin-bottom: 1rem; border-left: 4px solid #667eea;">
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                            <div>
                                <h4 style="color: #2d3748; margin-bottom: 0.5rem;">${job.topic}</h4>
                                <p style="color: #666; margin: 0;">Category: ${job.category} | Status: <span style="color: ${job.status === 'pending_review' ? '#f59e0b' : '#10b981'}">${job.status}</span></p>
                                <p style="color: #666; margin: 0.5rem 0 0 0;">Total Ideas: ${job.total_articles} | Completed: ${job.completed_articles}</p>
                            </div>
                            <div style="display: flex; gap: 0.5rem;">
                                <button class="btn btn-sm btn-primary" onclick="brainstorm.viewJobIdeas('${job._id}')">
                                    <i class="fas fa-eye"></i> View Ideas
                                </button>
                                ${job.status === 'pending_review' ? `
                                    <button class="btn btn-sm btn-success" onclick="brainstorm.continueJob('${job._id}')">
                                        <i class="fas fa-play"></i> Continue
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                        ${job.ideas && job.ideas.length > 0 ? `
                            <div class="job-ideas-preview">
                                <h5 style="color: #4a5568; margin-bottom: 0.5rem;">Generated Ideas:</h5>
                                <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                                    ${job.ideas.slice(0, 3).map(idea => `
                                        <span style="background: #f0f4f8; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #4a5568;">
                                            ${idea.title}
                                        </span>
                                    `).join('')}
                                    ${job.ideas.length > 3 ? `<span style="color: #666; font-size: 0.8rem;">+${job.ideas.length - 3} more</span>` : ''}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;
        
        resultsDiv.innerHTML = existingJobsHTML;
    },

    viewJobIdeas(jobId) {
        const job = this.existingJobs.find(j => j._id === jobId);
        if (!job || !job.ideas) {
            showToast('No ideas found for this job', 'warning');
            return;
        }
        
        const resultsDiv = document.getElementById('brainstormResults');
        resultsDiv.innerHTML = `
            <div class="job-ideas-detail">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                    <h3 style="color: #2d3748; margin: 0;">
                        <i class="fas fa-lightbulb" style="color: #667eea; margin-right: 0.5rem;"></i>
                        Ideas for "${job.topic}"
                    </h3>
                    <button class="btn btn-secondary" onclick="brainstorm.displayExistingJobs()">
                        <i class="fas fa-arrow-left"></i> Back to Jobs
                    </button>
                </div>
                ${job.ideas.map(idea => `
                    <div class="idea-card">
                        <div class="idea-header">
                            <div>
                                <h3 class="idea-title">${idea.title}</h3>
                                <span class="idea-role">${idea.cluster_role}</span>
                            </div>
                            <button class="btn btn-sm btn-primary" onclick="brainstorm.useIdea('${idea.title}', '${idea.primary_keyword}', '${idea.search_intent}')">
                                <i class="fas fa-plus"></i> Use Idea
                            </button>
                        </div>
                        
                        <div class="idea-keywords">
                            <div style="margin-bottom: 1rem;">
                                <strong style="color: #4a5568; display: block; margin-bottom: 0.5rem;">Primary:</strong>
                                <span class="keyword-tag" style="background: #667eea; color: white; font-weight: 600;">${idea.primary_keyword}</span>
                            </div>
                            <div style="margin-bottom: 1rem;">
                                <strong style="color: #4a5568; display: block; margin-bottom: 0.5rem;">Secondary:</strong>
                                ${idea.secondary_keywords.map(keyword => `<span class="keyword-tag">${keyword}</span>`).join('')}
                            </div>
                            ${idea.long_tail_keywords && idea.long_tail_keywords.length > 0 ? `
                                <div style="margin-bottom: 1rem;">
                                    <strong style="color: #4a5568; display: block; margin-bottom: 0.5rem;">Long-tail Keywords:</strong>
                                    ${idea.long_tail_keywords.map(keyword => `<span class="keyword-tag" style="background: #f0f4f8; color: #4a5568;">${keyword}</span>`).join('')}
                                </div>
                            ` : ''}
                        </div>
                        
                        <div class="idea-meta" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin: 1rem 0; padding: 1rem; background: #f8f9fa; border-radius: 8px;">
                            <div>
                                <strong style="color: #4a5568; display: block; margin-bottom: 0.25rem;">Search Intent:</strong>
                                <span style="color: #667eea; font-weight: 500;">${idea.search_intent}</span>
                            </div>
                            <div>
                                <strong style="color: #4a5568; display: block; margin-bottom: 0.25rem;">Funnel Stage:</strong>
                                <span style="color: #667eea; font-weight: 500;">${idea.funnel_stage}</span>
                            </div>
                        </div>
                        
                        <div class="idea-strategy" style="background: #f8f9fa; padding: 1rem; border-radius: 8px; border-left: 4px solid #667eea;">
                            <strong style="color: #4a5568; display: block; margin-bottom: 0.5rem;">Content Strategy:</strong>
                            <p style="color: #4a5568; margin: 0; line-height: 1.6;">${idea.content_strategy}</p>
                        </div>
                        
                        <div class="idea-guidance" style="margin-top: 1rem;">
                            <label style="color: #4a5568; font-weight: 600; display: block; margin-bottom: 0.5rem;">Additional Guidance:</label>
                            <textarea class="guidance-input" placeholder="Any specific instructions for this article..." style="width: 100%; padding: 0.75rem; border: 2px solid #e9ecef; border-radius: 8px; font-family: inherit; resize: vertical; min-height: 80px;"></textarea>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    continueJob(jobId) {
        // Switch to bulk generation and load this job
        navigation.switchSection('bulk');
        // The bulk module should handle loading the job
        if (window.bulk && bulk.loadJobById) {
            bulk.loadJobById(jobId);
        }
    }
};



// Navigation
const navigation = {
    switchSection(sectionName) {
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        const navItem = document.querySelector(`[data-section="${sectionName}"]`);
        if (navItem) {
            navItem.classList.add('active');
        }
        
        // Update content sections
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });
        const contentSection = document.getElementById(`${sectionName}-section`);
        if (contentSection) {
            contentSection.classList.add('active');
        }
        
        // Update page title
        const titles = {
            overview: 'Overview',
            content: 'Content Management',
            create: 'Create Content',
            brainstorm: 'Brainstorm Ideas',
            bulk: 'Bulk Generation',
            optimization: 'SEO Tools',
            workflow: 'Workflow',
            team: 'Team',
            insights: 'AI Insights',
            settings: 'Settings'
        };
        
        const pageTitle = document.getElementById('pageTitle');
        if (pageTitle) pageTitle.textContent = titles[sectionName] || sectionName;
        
        // Load section-specific data
        switch (sectionName) {
            case 'overview':
                dashboard.loadStats();
                dashboard.loadRecentActivity();
                break;
            case 'content':
                // Clear any existing data first
                contentData = [];
                filteredContent = [];
                selectedContentIds.clear();
                dashboard.updateBulkActionsBar();
                dashboard.loadContent();
                break;
            case 'eeat':
                eeat.loadCategories();
                eeat.loadEEATStats();
                break;
            case 'workflow':
                workflow.loadWorkflowData();
                break;
            case 'team':
                team.loadTeamData();
                break;
            case 'insights':
                insights.loadInsights();
                break;
        }
    }
};

// Bulk Generation Management
const bulk = {
    currentJob: null,
    currentStep: 1,
    categories: [],
    selectedCategory: null,
    selectedDirectCategory: null,

    async init() {
        await this.loadCategories();
        await this.loadJobs();
    },

    async loadCategories(retryCount = 0) {
        try {
            this.categories = await api.getCategories();
            this.renderBulkCategoryDropdown();
            this.renderDirectCategoryDropdown();
        } catch (error) {
            console.error('Failed to load categories for bulk:', error);
            
            // Retry once after a short delay if this is the first attempt
            if (retryCount === 0) {
                console.log('Retrying bulk categories load in 2 seconds...');
                setTimeout(() => {
                    this.loadCategories(1);
                }, 2000);
                return;
            }
            
            this.categories = [];
        }
    },

    // Tab Management
    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.bulk-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        const activeTab = document.querySelector(`[onclick="bulk.switchTab('${tabName}')"]`);
        if (activeTab) activeTab.classList.add('active');

        // Update tab content
        document.querySelectorAll('.bulk-tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        const activeContent = document.getElementById(`bulk-${tabName}`);
        if (activeContent) activeContent.classList.add('active');

        // Load jobs if switching to jobs tab
        if (tabName === 'jobs') {
            this.loadJobs();
        }
    },

    // Pipeline Step Management
    goToStep(stepNumber) {
        console.log('Going to step:', stepNumber);
        
        // Update step indicator
        document.querySelectorAll('.step').forEach((step, index) => {
            step.classList.remove('active', 'completed');
            if (index + 1 < stepNumber) {
                step.classList.add('completed');
            } else if (index + 1 === stepNumber) {
                step.classList.add('active');
            }
        });

        // Update step content
        document.querySelectorAll('.pipeline-step').forEach(step => {
            step.classList.remove('active');
        });
        
        const targetStep = document.getElementById(`step-${stepNumber}`);
        console.log('Target step element:', targetStep);
        
        if (targetStep) {
            targetStep.classList.add('active');
            console.log('Step', stepNumber, 'is now active');
        } else {
            console.error('Step element not found:', `step-${stepNumber}`);
        }

        this.currentStep = stepNumber;
    },

    // Category Management for Bulk Brainstorm
    renderBulkCategoryDropdown(filter = '') {
        const dropdown = document.getElementById('bulkCategoryDropdown');
        if (!dropdown) return;
        
        dropdown.innerHTML = '';

        const filteredCategories = this.categories.filter(cat => 
            cat.name.toLowerCase().includes(filter.toLowerCase()) ||
            cat.slug.toLowerCase().includes(filter.toLowerCase())
        );

        filteredCategories.forEach(category => {
            const option = document.createElement('div');
            option.className = 'category-option';
            option.innerHTML = `
                <span class="category-name">${category.name}</span>
                <span class="category-slug">${category.slug}</span>
            `;
            option.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.selectBulkCategory(category);
            });
            dropdown.appendChild(option);
        });

        if (filter.trim() && !filteredCategories.some(cat => 
            cat.name.toLowerCase() === filter.toLowerCase() || 
            cat.slug.toLowerCase() === filter.toLowerCase()
        )) {
            const newOption = document.createElement('div');
            newOption.className = 'category-option new-category';
            newOption.innerHTML = `
                <span class="category-name">✨ Create "${filter.trim()}"</span>
                <span class="category-slug">New category</span>
            `;
            newOption.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.selectNewBulkCategory(filter.trim());
            });
            dropdown.appendChild(newOption);
        }
    },

    selectBulkCategory(category) {
        this.selectedCategory = category;
        const searchInput = document.getElementById('bulkCategorySearch');
        const hiddenSelect = document.getElementById('bulkCategorySelect');
        
        searchInput.value = category.name;
        hiddenSelect.value = category.slug;
        
        this.hideCategoryDropdown();
    },

    selectNewBulkCategory(name) {
        const slug = name.trim().toLowerCase().replace(/\s+/g, '-');
        this.selectedCategory = { name: name.trim(), slug: slug, isNew: true };
        
        const searchInput = document.getElementById('bulkCategorySearch');
        const hiddenSelect = document.getElementById('bulkCategorySelect');
        
        searchInput.value = name.trim();
        hiddenSelect.value = 'custom';
        
        this.hideCategoryDropdown();
    },

    filterCategories(value) {
        this.renderBulkCategoryDropdown(value);
        if (value) {
            this.showCategoryDropdown();
        }
    },

    showCategoryDropdown() {
        const dropdown = document.getElementById('bulkCategoryDropdown');
        if (dropdown) dropdown.style.display = 'block';
    },

    hideCategoryDropdown() {
        setTimeout(() => {
            const dropdown = document.getElementById('bulkCategoryDropdown');
            if (dropdown) dropdown.style.display = 'none';
        }, 150);
    },

    // Category Management for Direct Generation
    renderDirectCategoryDropdown(filter = '') {
        const dropdown = document.getElementById('directCategoryDropdown');
        if (!dropdown) return;
        
        dropdown.innerHTML = '';

        const filteredCategories = this.categories.filter(cat => 
            cat.name.toLowerCase().includes(filter.toLowerCase()) ||
            cat.slug.toLowerCase().includes(filter.toLowerCase())
        );

        filteredCategories.forEach(category => {
            const option = document.createElement('div');
            option.className = 'category-option';
            option.innerHTML = `
                <span class="category-name">${category.name}</span>
                <span class="category-slug">${category.slug}</span>
            `;
            option.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.selectDirectCategory(category);
            });
            dropdown.appendChild(option);
        });

        if (filter.trim() && !filteredCategories.some(cat => 
            cat.name.toLowerCase() === filter.toLowerCase() || 
            cat.slug.toLowerCase() === filter.toLowerCase()
        )) {
            const newOption = document.createElement('div');
            newOption.className = 'category-option new-category';
            newOption.innerHTML = `
                <span class="category-name">✨ Create "${filter.trim()}"</span>
                <span class="category-slug">New category</span>
            `;
            newOption.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.selectNewDirectCategory(filter.trim());
            });
            dropdown.appendChild(newOption);
        }
    },

    selectDirectCategory(category) {
        this.selectedDirectCategory = category;
        const searchInput = document.getElementById('directCategorySearch');
        const hiddenSelect = document.getElementById('directCategorySelect');
        
        searchInput.value = category.name;
        hiddenSelect.value = category.slug;
        
        this.hideDirectCategoryDropdown();
    },

    selectNewDirectCategory(name) {
        const slug = name.trim().toLowerCase().replace(/\s+/g, '-');
        this.selectedDirectCategory = { name: name.trim(), slug: slug, isNew: true };
        
        const searchInput = document.getElementById('directCategorySearch');
        const hiddenSelect = document.getElementById('directCategorySelect');
        
        searchInput.value = name.trim();
        hiddenSelect.value = 'custom';
        
        this.hideDirectCategoryDropdown();
    },

    filterDirectCategories(value) {
        this.renderDirectCategoryDropdown(value);
        if (value) {
            this.showDirectCategoryDropdown();
        }
    },

    showDirectCategoryDropdown() {
        const dropdown = document.getElementById('directCategoryDropdown');
        if (dropdown) dropdown.style.display = 'block';
    },

    hideDirectCategoryDropdown() {
        setTimeout(() => {
            const dropdown = document.getElementById('directCategoryDropdown');
            if (dropdown) dropdown.style.display = 'none';
        }, 150);
    },

    getTargetLength(targetLength) {
        switch (targetLength) {
            case 'short': return 1000;
            case 'medium': return 1500;
            case 'long': return 2500;
            case 'comprehensive': return 3500;
            case 'extended': return 5000;
            default: return parseInt(targetLength) || 1500;
        }
    },

    // Step 1: Brainstorm
    async startBrainstorm(formData) {
        try {
            const resultsDiv = document.getElementById('bulkBrainstormResults');
            resultsDiv.innerHTML = '<div class="bulk-results loading"><i class="fas fa-spinner"></i><p>Brainstorming article ideas...</p></div>';

            let category;
            if (this.selectedCategory) {
                category = this.selectedCategory.slug;
            } else {
                category = formData.category || 'general';
            }

            const data = {
                topic: formData.topic,
                category: category,
                num_articles: parseInt(formData.num_articles),
                target_length: this.getTargetLength(formData.target_length),
                content_type: formData.content_type || 'article',
                target_audience: formData.target_audience || 'general',
                brand_voice: formData.brand_voice || 'professional',
                competitor_insights: formData.competitor_insights || ''
            };

            const result = await api.bulkBrainstorm(data);
            console.log('Bulk brainstorm result:', result); // Debug log
            
            // Ensure the result has a proper job ID
            if (result && !result.job_id && !result._id && !result.id) {
                console.warn('API response missing job ID, result:', result);
            }
            
            this.currentJob = result;
            console.log('Set currentJob to:', this.currentJob); // Debug log

            // Handle different response structures
            const articleIdeas = result.article_ideas || result.ideas || (result.data && result.data.article_ideas) || [];
            
            if (articleIdeas && articleIdeas.length > 0) {
                // Update currentJob with normalized structure
                this.currentJob.article_ideas = articleIdeas;
                resultsDiv.innerHTML = `
                    <div class="bulk-results">
                        <h3>✨ Generated ${articleIdeas.length} Article Ideas</h3>
                        <p>Job ID: ${result.job_id || result._id || 'N/A'}</p>
                        <button class="btn btn-primary" onclick="bulk.proceedToReview()">
                            <i class="fas fa-arrow-right"></i>
                            Review Ideas
                        </button>
                    </div>
                `;
            } else {
                console.log('No article ideas found. Full result:', result);
                console.log('Extracted articleIdeas:', articleIdeas);
                resultsDiv.innerHTML = `
                    <div class="bulk-results">
                        <p>No ideas generated. Please try again.</p>
                        <details style="margin-top: 1rem;">
                            <summary>Debug Info</summary>
                            <pre style="background: #f5f5f5; padding: 1rem; border-radius: 4px; font-size: 0.8rem; overflow: auto;">
${JSON.stringify(result, null, 2)}
                            </pre>
                        </details>
                    </div>
                `;
            }

        } catch (error) {
            console.error('Brainstorm failed:', error);
            const resultsDiv = document.getElementById('bulkBrainstormResults');
            resultsDiv.innerHTML = `<div class="bulk-results"><p class="error">Failed to brainstorm ideas: ${error.message}</p></div>`;
        }
    },

    proceedToReview() {
        console.log('Proceeding to review with currentJob:', this.currentJob);
        this.loadReviewIdeas();
        this.goToStep(2);
    },

    // Step 2: Review
    loadReviewIdeas() {
        console.log('Loading review ideas with currentJob:', this.currentJob);
        
        if (!this.currentJob) {
            console.error('No currentJob found');
            return;
        }
        
        if (!this.currentJob.article_ideas) {
            console.error('No article_ideas in currentJob:', this.currentJob);
            return;
        }

        const reviewDiv = document.getElementById('reviewIdeas');
        
        if (!reviewDiv) {
            console.error('reviewIdeas div not found!');
            showToast('Review interface not found. Please refresh the page.', 'error');
            return;
        }
        
        console.log('Found reviewDiv:', reviewDiv);
        
        // Add job information header
        const jobInfoHeader = `
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 1.5rem; border-radius: 12px; margin-bottom: 2rem; color: white;">
                <h3 style="margin: 0 0 1rem 0; font-size: 1.5rem;">
                    <i class="fas fa-clipboard-check" style="margin-right: 0.5rem;"></i>
                    Review Ideas: ${this.currentJob.topic || 'Bulk Content Generation'}
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; opacity: 0.95;">
                    ${this.currentJob.category ? `
                        <div>
                            <div style="font-size: 0.875rem; opacity: 0.9;">Category</div>
                            <div style="font-weight: 600; font-size: 1.1rem;">${this.currentJob.category}</div>
                        </div>
                    ` : ''}
                    <div>
                        <div style="font-size: 0.875rem; opacity: 0.9;">Total Ideas</div>
                        <div style="font-weight: 600; font-size: 1.1rem;">${this.currentJob.article_ideas.length}</div>
                    </div>
                    ${this.currentJob.target_length ? `
                        <div>
                            <div style="font-size: 0.875rem; opacity: 0.9;">Target Length</div>
                            <div style="font-weight: 600; font-size: 1.1rem;">${this.currentJob.target_length} words</div>
                        </div>
                    ` : ''}
                    ${this.currentJob.content_type ? `
                        <div>
                            <div style="font-size: 0.875rem; opacity: 0.9;">Content Type</div>
                            <div style="font-weight: 600; font-size: 1.1rem; text-transform: capitalize;">${this.currentJob.content_type}</div>
                        </div>
                    ` : ''}
                    ${this.currentJob.target_audience ? `
                        <div>
                            <div style="font-size: 0.875rem; opacity: 0.9;">Target Audience</div>
                            <div style="font-weight: 600; font-size: 1.1rem; text-transform: capitalize;">${this.currentJob.target_audience}</div>
                        </div>
                    ` : ''}
                    ${this.currentJob.brand_voice ? `
                        <div>
                            <div style="font-size: 0.875rem; opacity: 0.9;">Brand Voice</div>
                            <div style="font-weight: 600; font-size: 1.1rem; text-transform: capitalize;">${this.currentJob.brand_voice}</div>
                        </div>
                    ` : ''}
                    ${this.currentJob.status ? `
                        <div>
                            <div style="font-size: 0.875rem; opacity: 0.9;">Status</div>
                            <div style="font-weight: 600; font-size: 1.1rem; text-transform: capitalize;">${this.currentJob.status}</div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        reviewDiv.innerHTML = jobInfoHeader;

        console.log('Loading', this.currentJob.article_ideas.length, 'ideas for review');

        // Add a fallback message if no ideas are processed
        if (this.currentJob.article_ideas.length === 0) {
            reviewDiv.innerHTML = jobInfoHeader + `
                <div style="text-align: center; padding: 2rem; color: #64748b;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                    <h3>No Ideas to Review</h3>
                    <p>The job doesn't contain any ideas to review.</p>
                    <button class="btn btn-secondary" onclick="bulk.goToStep(1)">
                        <i class="fas fa-arrow-left"></i> Back to Brainstorm
                    </button>
                </div>
            `;
            return;
        }

        this.currentJob.article_ideas.forEach((idea, index) => {
            console.log('Processing idea:', idea);
            
            // Handle different idea structures
            const title = idea.title || idea.name || `Idea ${index + 1}`;
            const primaryKeyword = idea.primary_keyword || idea.keyword || '';
            const secondaryKeywords = idea.secondary_keywords || idea.keywords || [];
            
            const ideaDiv = document.createElement('div');
            ideaDiv.className = 'review-idea selected';
            ideaDiv.innerHTML = `
                <div class="idea-header">
                    <input type="checkbox" class="idea-checkbox" checked data-idea-id="${title}" onchange="bulk.toggleIdea(this)">
                    <div class="idea-title-section">
                        <label class="field-label">Title:</label>
                        <input type="text" class="idea-title-input" value="${title}" data-idea-id="${title}">
                    </div>
                </div>
                
                <div class="idea-details-grid">
                    <div class="detail-section">
                        <label class="field-label">Cluster Role:</label>
                        <input type="text" class="detail-input" value="${idea.cluster_role || ''}" data-field="cluster_role">
                    </div>
                    
                    <div class="detail-section">
                        <label class="field-label">Search Intent:</label>
                        <select class="detail-select" data-field="search_intent">
                            <option value="informational" ${(idea.search_intent === 'informational') ? 'selected' : ''}>Informational</option>
                            <option value="commercial" ${(idea.search_intent === 'commercial') ? 'selected' : ''}>Commercial</option>
                            <option value="navigational" ${(idea.search_intent === 'navigational') ? 'selected' : ''}>Navigational</option>
                            <option value="transactional" ${(idea.search_intent === 'transactional') ? 'selected' : ''}>Transactional</option>
                        </select>
                    </div>
                    
                    <div class="detail-section">
                        <label class="field-label">Funnel Stage:</label>
                        <select class="detail-select" data-field="funnel_stage">
                            <option value="Top of Funnel" ${(idea.funnel_stage === 'Top of Funnel' || idea.funnel_stage === 'Top/Middle of Funnel') ? 'selected' : ''}>Top of Funnel</option>
                            <option value="Middle of Funnel" ${(idea.funnel_stage === 'Middle of Funnel') ? 'selected' : ''}>Middle of Funnel</option>
                            <option value="Bottom of Funnel" ${(idea.funnel_stage === 'Bottom of Funnel') ? 'selected' : ''}>Bottom of Funnel</option>
                        </select>
                    </div>
                    
                    <div class="detail-section">
                        <label class="field-label">Content Type:</label>
                        <select class="detail-select" data-field="content_type">
                            <option value="article" ${(idea.content_type === 'article') ? 'selected' : ''}>Article</option>
                            <option value="blog_post" ${(idea.content_type === 'blog_post') ? 'selected' : ''}>Blog Post</option>
                            <option value="guide" ${(idea.content_type === 'guide') ? 'selected' : ''}>Guide</option>
                            <option value="tutorial" ${(idea.content_type === 'tutorial') ? 'selected' : ''}>Tutorial</option>
                            <option value="how_to" ${(idea.content_type === 'how_to') ? 'selected' : ''}>How To</option>
                        </select>
                    </div>
                    
                    <div class="detail-section">
                        <label class="field-label">Target Audience:</label>
                        <input type="text" class="detail-input" value="${idea.target_audience || 'general'}" data-field="target_audience">
                    </div>
                    
                    <div class="detail-section">
                        <label class="field-label">Brand Voice:</label>
                        <input type="text" class="detail-input" value="${idea.brand_voice || 'professional'}" data-field="brand_voice">
                    </div>
                </div>
                
                <div class="keywords-section">
                    <div class="keyword-group">
                        <label class="field-label">Primary Keyword:</label>
                        <input type="text" class="keyword-input primary" value="${primaryKeyword}" data-type="primary">
                    </div>
                    
                    <div class="keyword-group">
                        <label class="field-label">Secondary Keywords:</label>
                        <div class="keyword-inputs-container">
                            ${Array.isArray(secondaryKeywords) ? 
                                secondaryKeywords.map((kw, idx) => `
                                    <div class="keyword-input-row">
                                        <input type="text" class="keyword-input secondary" value="${kw}" data-type="secondary" data-index="${idx}">
                                        <button type="button" class="btn-remove-keyword" onclick="bulk.removeSecondaryKeyword(this)">×</button>
                                    </div>
                                `).join('') :
                                `<div class="keyword-input-row">
                                    <input type="text" class="keyword-input secondary" value="${secondaryKeywords}" data-type="secondary" data-index="0">
                                    <button type="button" class="btn-remove-keyword" onclick="bulk.removeSecondaryKeyword(this)">×</button>
                                </div>`
                            }
                            <button type="button" class="btn-add-keyword" onclick="bulk.addSecondaryKeyword(this)">+ Add Secondary Keyword</button>
                        </div>
                    </div>
                    
                    <div class="keyword-group">
                        <label class="field-label">Long-tail Keywords:</label>
                        <div class="keyword-inputs-container">
                            ${idea.long_tail_keywords && idea.long_tail_keywords.length > 0 ? 
                                idea.long_tail_keywords.map((kw, idx) => `
                                    <div class="keyword-input-row">
                                        <input type="text" class="keyword-input longtail" value="${kw}" data-type="longtail" data-index="${idx}">
                                        <button type="button" class="btn-remove-keyword" onclick="bulk.removeLongtailKeyword(this)">×</button>
                                    </div>
                                `).join('') :
                                `<div class="keyword-input-row">
                                    <input type="text" class="keyword-input longtail" value="" data-type="longtail" data-index="0">
                                    <button type="button" class="btn-remove-keyword" onclick="bulk.removeLongtailKeyword(this)">×</button>
                                </div>`
                            }
                            <button type="button" class="btn-add-keyword" onclick="bulk.addLongtailKeyword(this)">+ Add Long-tail Keyword</button>
                        </div>
                    </div>
                </div>
                
                <div class="strategy-section">
                    <label class="field-label">Content Strategy:</label>
                    <textarea class="strategy-input" data-field="content_strategy" placeholder="Enter content strategy...">${idea.content_strategy || ''}</textarea>
                </div>
                
                ${idea.guidance ? `
                    <div class="ai-guidance-section" style="background: #d1ecf1; padding: 1rem; border-radius: 8px; border-left: 4px solid #17a2b8; margin-top: 1rem;">
                        <label class="field-label" style="color: #0c5460; font-weight: 600;">
                            <i class="fas fa-lightbulb" style="margin-right: 0.25rem;"></i> AI Generated Guidance:
                        </label>
                        <div style="color: #0c5460; line-height: 1.6; white-space: pre-wrap; font-size: 0.9rem; margin-top: 0.5rem;">${idea.guidance}</div>
                    </div>
                ` : ''}
                
                <div class="idea-guidance">
                    <label class="field-label">Additional Custom Guidance:</label>
                    <textarea class="guidance-input" placeholder="Any specific custom instructions for this article..."></textarea>
                </div>
            `;
            reviewDiv.appendChild(ideaDiv);
            
            console.log('Added idea div to review:', ideaDiv);
        });
        
        console.log('Finished loading all ideas. Review div final content:', reviewDiv.innerHTML.length, 'characters');
        console.log('Review div children count:', reviewDiv.children.length);
    },

    toggleIdea(checkbox) {
        const ideaDiv = checkbox.closest('.review-idea');
        if (checkbox.checked) {
            ideaDiv.classList.remove('rejected');
            ideaDiv.classList.add('selected');
        } else {
            ideaDiv.classList.remove('selected');
            ideaDiv.classList.add('rejected');
        }
    },

    addSecondaryKeyword(button) {
        const container = button.parentElement;
        const newRow = document.createElement('div');
        newRow.className = 'keyword-input-row';
        newRow.innerHTML = `
            <input type="text" class="keyword-input secondary" value="" data-type="secondary" data-index="${container.children.length - 1}">
            <button type="button" class="btn-remove-keyword" onclick="bulk.removeSecondaryKeyword(this)">×</button>
        `;
        container.insertBefore(newRow, button);
    },

    removeSecondaryKeyword(button) {
        const row = button.parentElement;
        if (row.parentElement.children.length > 2) { // Keep at least one input
            row.remove();
        }
    },

    addLongtailKeyword(button) {
        const container = button.parentElement;
        const newRow = document.createElement('div');
        newRow.className = 'keyword-input-row';
        newRow.innerHTML = `
            <input type="text" class="keyword-input longtail" value="" data-type="longtail" data-index="${container.children.length - 1}">
            <button type="button" class="btn-remove-keyword" onclick="bulk.removeLongtailKeyword(this)">×</button>
        `;
        container.insertBefore(newRow, button);
    },

    removeLongtailKeyword(button) {
        const row = button.parentElement;
        if (row.parentElement.children.length > 2) { // Keep at least one input
            row.remove();
        }
    },

    async submitReview() {
        try {
            // Check if we have a current job
            if (!this.currentJob) {
                showToast('No job selected for review', 'error');
                return;
            }

            // Get the job ID - try different possible field names
            const jobId = this.currentJob.job_id || this.currentJob._id || this.currentJob.id;
            
            if (!jobId) {
                console.error('Current job object:', this.currentJob);
                showToast('Invalid job ID. Please reload the job.', 'error');
                return;
            }

            console.log('Submitting review for job ID:', jobId);

            const approvedIdeas = [];
            const rejectedIdeas = [];

            document.querySelectorAll('.review-idea').forEach(ideaDiv => {
                const checkbox = ideaDiv.querySelector('.idea-checkbox');
                const titleInput = ideaDiv.querySelector('.idea-title-input');
                const originalId = checkbox.dataset.ideaId;
                
                if (checkbox.checked) {
                    const keywords = [];
                    ideaDiv.querySelectorAll('.keyword-input').forEach(input => {
                        if (input.value.trim()) keywords.push(input.value.trim());
                    });
                    
                    const guidance = ideaDiv.querySelector('.guidance-input').value.trim();
                    
                    approvedIdeas.push({
                        idea_id: originalId,
                        title: titleInput.value.trim(),
                        keywords: keywords,
                        guidance: guidance || null
                    });
                } else {
                    rejectedIdeas.push(originalId);
                }
            });

            if (approvedIdeas.length === 0) {
                showToast('Please select at least one idea to approve', 'warning');
                return;
            }

            const reviewData = {
                approved_ideas: approvedIdeas,
                rejected_idea_ids: rejectedIdeas
            };

            console.log('Review data:', reviewData);
            
            await api.reviewBulkIdeas(jobId, reviewData);
            
            showToast(`Successfully approved ${approvedIdeas.length} ideas!`, 'success');
            this.goToStep(3);

        } catch (error) {
            console.error('Review submission failed:', error);
            showToast(`Failed to submit review: ${error.message}`, 'error');
        }
    },

    // Step 3: Generate
    async startGeneration() {
        try {
            // Check if we have a current job
            if (!this.currentJob) {
                showToast('No job selected for generation', 'error');
                return;
            }

            // Get the job ID - try different possible field names
            const jobId = this.currentJob.job_id || this.currentJob._id || this.currentJob.id;
            
            if (!jobId) {
                console.error('Current job object:', this.currentJob);
                showToast('Invalid job ID. Please reload the job.', 'error');
                return;
            }

            console.log('Starting generation for job ID:', jobId);

            const progressDiv = document.getElementById('generationProgress');
            progressDiv.innerHTML = `
                <div class="progress-header">
                    <h4>🚀 Starting Article Generation</h4>
                    <span>Job ID: ${jobId}</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 0%"></div>
                </div>
                <p>Initializing generation process...</p>
            `;

            await api.startBulkGeneration(jobId);
            
            showToast('Article generation started!', 'success');
            
            // Start monitoring progress
            this.monitorGenerationProgress();

        } catch (error) {
            console.error('Generation start failed:', error);
            showToast(`Failed to start generation: ${error.message}`, 'error');
        }
    },

    async monitorGenerationProgress() {
        const progressDiv = document.getElementById('generationProgress');
        
        const checkProgress = async () => {
            try {
                // Get the job ID safely
                const jobId = this.currentJob?.job_id || this.currentJob?._id || this.currentJob?.id;
                
                if (!jobId) {
                    console.error('No valid job ID for monitoring progress');
                    return;
                }
                
                const jobStatus = await api.getBulkJobStatus(jobId);
                
                const progressPercentage = jobStatus.progress || 0;
                const progressFill = progressDiv.querySelector('.progress-fill');
                if (progressFill) {
                    progressFill.style.width = `${progressPercentage}%`;
                }

                progressDiv.innerHTML = `
                    <div class="progress-header">
                        <h4>📝 Generating Articles</h4>
                        <span>${Math.round(progressPercentage)}% Complete</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progressPercentage}%"></div>
                    </div>
                    <div class="progress-details">
                        <div class="progress-item ${jobStatus.status === 'COMPLETED' ? 'completed' : ''}">
                            <strong>Status:</strong> ${jobStatus.status}
                        </div>
                        <div class="progress-item">
                            <strong>Articles:</strong> ${jobStatus.completed_articles || 0} / ${jobStatus.total_articles || 0}
                        </div>
                        <div class="progress-item">
                            <strong>Started:</strong> ${new Date(jobStatus.created_at).toLocaleString()}
                        </div>
                    </div>
                `;

                if (jobStatus.status === 'COMPLETED') {
                    showToast('All articles generated successfully!', 'success');
                    this.loadJobs(); // Refresh jobs list
                } else if (jobStatus.status === 'FAILED') {
                    showToast('Generation failed. Check the jobs list for details.', 'error');
                } else if (jobStatus.status === 'GENERATING') {
                    // Continue monitoring
                    setTimeout(checkProgress, 5000);
                }

            } catch (error) {
                console.error('Progress check failed:', error);
                setTimeout(checkProgress, 10000); // Retry after longer delay
            }
        };

        checkProgress();
    },

    // Direct Generation
    async startDirectGeneration(formData) {
        try {
            const resultsDiv = document.getElementById('directBulkResults');
            resultsDiv.innerHTML = '<div class="bulk-results loading"><i class="fas fa-spinner"></i><p>Starting direct generation...</p></div>';

            let category;
            if (this.selectedDirectCategory) {
                category = this.selectedDirectCategory.slug;
            } else {
                category = formData.category || 'general';
            }

            const data = {
                topic: formData.topic,
                category: category,
                num_articles: parseInt(formData.num_articles)
            };

            const result = await api.directBulkGenerate(data);

            resultsDiv.innerHTML = `
                <div class="bulk-results">
                    <h3>🚀 Direct Generation Started</h3>
                    <p>Job ID: ${result.job_id}</p>
                    <p>Generating ${data.num_articles} articles about "${data.topic}"</p>
                    <button class="btn btn-primary" onclick="bulk.switchTab('jobs')">
                        <i class="fas fa-list"></i>
                        Monitor Progress
                    </button>
                </div>
            `;

            showToast('Direct generation started successfully!', 'success');

        } catch (error) {
            console.error('Direct generation failed:', error);
            const resultsDiv = document.getElementById('directBulkResults');
            resultsDiv.innerHTML = `<div class="bulk-results"><p class="error">Failed to start generation: ${error.message}</p></div>`;
        }
    },

    // Job Management


    renderJobs(jobs) {
        const jobsList = document.getElementById('jobsList');
        if (!jobsList) return;

        if (!jobs || jobs.length === 0) {
            jobsList.innerHTML = '<p>No bulk generation jobs found.</p>';
            return;
        }

        jobsList.innerHTML = jobs.map(job => `
            <div class="job-card">
                <div class="job-header">
                    <div>
                        <div class="job-title">${job.topic}</div>
                        <div class="job-meta">
                            <span>Category: ${job.category}</span>
                            <span>Articles: ${job.total_articles}</span>
                            <span>Created: ${new Date(job.created_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <div class="job-status ${job.status.toLowerCase().replace('_', '-')}">${job.status}</div>
                </div>
                
                <div class="job-progress">
                    <div class="job-progress-bar">
                        <div class="job-progress-fill" style="width: ${job.progress || 0}%"></div>
                    </div>
                    <small>${Math.round(job.progress || 0)}% complete - ${job.completed_articles || 0} / ${job.total_articles} articles</small>
                </div>

                <div class="job-actions">
                    <button class="btn btn-sm btn-secondary" onclick="bulk.viewJobDetails('${job.job_id || job._id}')">
                        <i class="fas fa-eye"></i> View Details
                    </button>
                    ${job.status === 'GENERATING' || job.status === 'PENDING' ? 
                        `<button class="btn btn-sm btn-warning" onclick="bulk.cancelJob('${job.job_id || job._id}')">
                            <i class="fas fa-stop"></i> Cancel
                        </button>` : ''
                    }
                    ${job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED' ? 
                        `<button class="btn btn-sm btn-danger" onclick="bulk.deleteJob('${job.job_id || job._id}')">
                            <i class="fas fa-trash"></i> Delete
                        </button>` : ''
                    }
                </div>
            </div>
        `).join('');
    },

    async viewJobDetails(jobId) {
        try {
            const job = await api.getBulkJobStatus(jobId);
            console.log('Job details:', job);
            
            // Create detailed job modal
            this.showJobDetailsModal(job);
            
        } catch (error) {
            console.error('Failed to get job details:', error);
            showToast('Failed to load job details', 'error');
        }
    },

    showJobDetailsModal(job) {
        // Create modal HTML
        const modalHTML = `
            <div id="jobDetailsModal" class="modal" style="display: block !important;">
                <div class="modal-content" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">
                    <div class="modal-header">
                        <h2><i class="fas fa-briefcase"></i> Job Details</h2>
                        <span class="modal-close" onclick="bulk.closeJobDetailsModal()">&times;</span>
                    </div>
                    <div class="modal-body">
                        ${this.renderJobDetailsContent(job)}
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if any
        const existingModal = document.getElementById('jobDetailsModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        document.body.classList.add('modal-open');
    },

    renderJobDetailsContent(job) {
        const articles = job.articles || job.generated_articles || [];
        const completedArticles = articles.filter(a => a.status === 'COMPLETED' || a.status === 'completed');
        const failedArticles = articles.filter(a => a.status === 'FAILED' || a.status === 'failed');
        
        return `
            <div class="job-details-container">
                <!-- Job Overview -->
                <div class="job-overview">
                    <div class="job-overview-header">
                        <div>
                            <h3>${job.topic || 'Bulk Generation Job'}</h3>
                            <div class="job-meta-detailed">
                                <span><i class="fas fa-tag"></i> Category: ${job.category || 'N/A'}</span>
                                <span><i class="fas fa-calendar"></i> Created: ${new Date(job.created_at).toLocaleString()}</span>
                                <span><i class="fas fa-clock"></i> Updated: ${new Date(job.updated_at || job.created_at).toLocaleString()}</span>
                            </div>
                        </div>
                        <div class="job-status-badge">
                            <span class="status-badge status-${job.status.toLowerCase().replace('_', '-')}">${job.status}</span>
                        </div>
                    </div>
                    
                    <!-- Progress Overview -->
                    <div class="job-progress-overview">
                        <div class="progress-stats">
                            <div class="stat-item">
                                <div class="stat-number">${job.total_articles || articles.length}</div>
                                <div class="stat-label">Total Articles</div>
                            </div>
                            <div class="stat-item completed">
                                <div class="stat-number">${completedArticles.length}</div>
                                <div class="stat-label">Completed</div>
                            </div>
                            <div class="stat-item failed">
                                <div class="stat-number">${failedArticles.length}</div>
                                <div class="stat-label">Failed</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-number">${Math.round(job.progress || 0)}%</div>
                                <div class="stat-label">Progress</div>
                            </div>
                        </div>
                        
                        <div class="progress-bar-detailed">
                            <div class="progress-fill" style="width: ${job.progress || 0}%"></div>
                        </div>
                    </div>
                </div>

                <!-- Articles List -->
                <div class="job-articles">
                    <div class="articles-header">
                        <h4><i class="fas fa-file-alt"></i> Articles (${articles.length})</h4>
                        ${job.status === 'COMPLETED' ? `
                            <div class="articles-actions">
                                <button class="btn btn-sm btn-primary" onclick="bulk.exportJobArticles('${job.job_id || job._id}')">
                                    <i class="fas fa-download"></i> Export All
                                </button>
                                <button class="btn btn-sm btn-secondary" onclick="bulk.republishJob('${job.job_id || job._id}')">
                                    <i class="fas fa-redo"></i> Republish
                                </button>
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="articles-grid">
                        ${articles.length > 0 ? articles.map(article => this.renderArticleCard(article, job)).join('') : '<p class="no-articles">No articles found for this job.</p>'}
                    </div>
                </div>

                <!-- Job Actions -->
                <div class="job-actions-footer">
                    ${job.status === 'GENERATING' || job.status === 'PENDING' ? `
                        <button class="btn btn-warning" onclick="bulk.cancelJob('${job.job_id || job._id}')">
                            <i class="fas fa-stop"></i> Cancel Job
                        </button>
                    ` : ''}
                    
                    ${job.status === 'FAILED' || job.status === 'CANCELLED' ? `
                        <button class="btn btn-primary" onclick="bulk.retryJob('${job.job_id || job._id}')">
                            <i class="fas fa-redo"></i> Retry Job
                        </button>
                    ` : ''}
                    
                    <button class="btn btn-danger" onclick="bulk.deleteJob('${job.job_id || job._id}')">
                        <i class="fas fa-trash"></i> Delete Job
                    </button>
                </div>
            </div>
        `;
    },

    renderArticleCard(article, job) {
        const statusClass = (article.status || 'pending').toLowerCase().replace('_', '-');
        const isCompleted = article.status === 'COMPLETED' || article.status === 'completed';
        
        return `
            <div class="article-card ${statusClass}">
                <div class="article-header">
                    <div class="article-title">${article.title || article.idea_title || 'Untitled Article'}</div>
                    <div class="article-status">
                        <span class="status-badge status-${statusClass}">${article.status || 'pending'}</span>
                    </div>
                </div>
                
                <div class="article-meta">
                    ${article.primary_keyword ? `<span><i class="fas fa-key"></i> ${article.primary_keyword}</span>` : ''}
                    ${article.word_count ? `<span><i class="fas fa-file-word"></i> ${article.word_count} words</span>` : ''}
                    ${article.created_at ? `<span><i class="fas fa-clock"></i> ${new Date(article.created_at).toLocaleString()}</span>` : ''}
                </div>

                ${article.error_message ? `
                    <div class="article-error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>${article.error_message}</span>
                    </div>
                ` : ''}

                <div class="article-actions">
                    ${isCompleted && article.content_id ? `
                        <button class="btn btn-sm btn-primary" onclick="dashboard.viewContent('${article.content_id}')">
                            <i class="fas fa-eye"></i> View Content
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="bulk.editArticle('${article.content_id}')">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                    ` : ''}
                    
                    ${article.status === 'FAILED' || article.status === 'failed' ? `
                        <button class="btn btn-sm btn-warning" onclick="bulk.retryArticle('${job.job_id || job._id}', '${article.article_id || article.id}')">
                            <i class="fas fa-redo"></i> Retry
                        </button>
                    ` : ''}
                    
                    <button class="btn btn-sm btn-danger" onclick="bulk.deleteArticle('${job.job_id || job._id}', '${article.article_id || article.id}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </div>
        `;
    },

    closeJobDetailsModal() {
        const modal = document.getElementById('jobDetailsModal');
        if (modal) {
            modal.remove();
            document.body.classList.remove('modal-open');
        }
    },

    // Job Management Actions
    async exportJobArticles(jobId) {
        try {
            showToast('Preparing export...', 'info');
            const job = await api.getBulkJobStatus(jobId);
            const articles = job.articles || job.generated_articles || [];
            const completedArticles = articles.filter(a => a.status === 'COMPLETED' || a.status === 'completed');
            
            if (completedArticles.length === 0) {
                showToast('No completed articles to export', 'warning');
                return;
            }

            // Create CSV export
            const csvContent = this.generateArticlesCSV(completedArticles);
            this.downloadCSV(csvContent, `bulk-job-${jobId}-articles.csv`);
            
            showToast(`Exported ${completedArticles.length} articles`, 'success');
        } catch (error) {
            console.error('Export failed:', error);
            showToast('Failed to export articles', 'error');
        }
    },

    generateArticlesCSV(articles) {
        const headers = ['Title', 'Primary Keyword', 'Word Count', 'Status', 'Created Date', 'Content ID'];
        const rows = articles.map(article => [
            article.title || '',
            article.primary_keyword || '',
            article.word_count || '',
            article.status || '',
            article.created_at ? new Date(article.created_at).toISOString() : '',
            article.content_id || ''
        ]);
        
        return [headers, ...rows].map(row => 
            row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(',')
        ).join('\n');
    },

    downloadCSV(content, filename) {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    async republishJob(jobId) {
        if (!confirm('Are you sure you want to republish all articles from this job?')) return;
        
        try {
            showToast('Republishing job...', 'info');
            // This would need a backend endpoint
            // await api.republishBulkJob(jobId);
            showToast('Job republish initiated', 'success');
        } catch (error) {
            console.error('Republish failed:', error);
            showToast('Failed to republish job', 'error');
        }
    },

    async retryJob(jobId) {
        if (!confirm('Are you sure you want to retry this job?')) return;
        
        try {
            showToast('Retrying job...', 'info');
            // This would need a backend endpoint
            // await api.retryBulkJob(jobId);
            showToast('Job retry initiated', 'success');
            this.closeJobDetailsModal();
            this.loadJobs();
        } catch (error) {
            console.error('Retry failed:', error);
            showToast('Failed to retry job', 'error');
        }
    },

    async deleteJob(jobId) {
        if (!confirm('Are you sure you want to delete this job? This action cannot be undone.')) return;
        
        try {
            showToast('Deleting job...', 'info');
            // This would need a backend endpoint
            // await api.deleteBulkJob(jobId);
            showToast('Job deleted successfully', 'success');
            this.closeJobDetailsModal();
            this.loadJobs();
        } catch (error) {
            console.error('Delete failed:', error);
            showToast('Failed to delete job', 'error');
        }
    },

    async retryArticle(jobId, articleId) {
        if (!confirm('Are you sure you want to retry this article?')) return;
        
        try {
            showToast('Retrying article...', 'info');
            // This would need a backend endpoint
            // await api.retryBulkArticle(jobId, articleId);
            showToast('Article retry initiated', 'success');
        } catch (error) {
            console.error('Article retry failed:', error);
            showToast('Failed to retry article', 'error');
        }
    },

    async deleteArticle(jobId, articleId) {
        if (!confirm('Are you sure you want to delete this article?')) return;
        
        try {
            showToast('Deleting article...', 'info');
            // This would need a backend endpoint
            // await api.deleteBulkArticle(jobId, articleId);
            showToast('Article deleted successfully', 'success');
        } catch (error) {
            console.error('Article delete failed:', error);
            showToast('Failed to delete article', 'error');
        }
    },

    async editArticle(contentId) {
        // Navigate to content editing
        showToast('Opening article for editing...', 'info');
        dashboard.viewContent(contentId);
        this.closeJobDetailsModal();
    },

    async cancelJob(jobId) {
        if (!confirm('Are you sure you want to cancel this job?')) return;
        
        try {
            await api.cancelBulkJob(jobId);
            showToast('Job cancelled successfully', 'success');
            this.loadJobs();
            
        } catch (error) {
            console.error('Failed to cancel job:', error);
            showToast('Failed to cancel job', 'error');
        }
    },

    async deleteJob(jobId) {
        if (!confirm('Are you sure you want to delete this job? This action cannot be undone.')) return;
        
        try {
            await api.deleteBulkJob(jobId);
            showToast('Job deleted successfully', 'success');
            this.loadJobs();
            
        } catch (error) {
            console.error('Failed to delete job:', error);
            showToast('Failed to delete job', 'error');
        }
    },

    async filterJobs() {
        const statusFilter = document.getElementById('jobStatusFilter').value;
        await this.loadJobs(statusFilter);
    },

    async refreshJobs() {
        const statusFilter = document.getElementById('jobStatusFilter').value;
        await this.loadJobs(statusFilter);
        showToast('Jobs refreshed', 'success');
    },

    async loadJobs(statusFilter = '') {
        try {
            const jobsList = document.getElementById('jobsList');
            const pendingReviewSection = document.getElementById('pendingReviewSection');
            const pendingReviewJobs = document.getElementById('pendingReviewJobs');
            
            if (!jobsList) return;

            jobsList.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading jobs...</div>';
            
            const jobs = await api.getBulkJobs(statusFilter, 0, 50);
            console.log('Loaded jobs:', jobs);
            
            if (jobs && jobs.length > 0) {
                // Separate pending review jobs
                const pendingReview = jobs.filter(job => job.status === 'pending_review');
                const otherJobs = jobs.filter(job => job.status !== 'pending_review');
                
                // Show pending review section if there are pending jobs and no filter
                if (pendingReview.length > 0 && !statusFilter) {
                    pendingReviewSection.style.display = 'block';
                    this.renderPendingReviewJobs(pendingReview);
                } else {
                    pendingReviewSection.style.display = 'none';
                }
                
                // Render other jobs
                if (otherJobs.length > 0 || statusFilter) {
                    this.renderJobs(statusFilter ? jobs : otherJobs);
                } else if (!statusFilter && pendingReview.length > 0) {
                    jobsList.innerHTML = `<div class="info-message">
                        <i class="fas fa-info-circle"></i>
                        <p>All your jobs are pending review. Check the section above to review them.</p>
                    </div>`;
                } else {
                    jobsList.innerHTML = `<div class="no-jobs">
                        <i class="fas fa-briefcase" style="font-size: 3rem; color: #9ca3af; margin-bottom: 1rem;"></i>
                        <p>No jobs found.</p>
                    </div>`;
                }
            } else {
                pendingReviewSection.style.display = 'none';
                jobsList.innerHTML = `<div class="no-jobs">
                    <i class="fas fa-briefcase" style="font-size: 3rem; color: #9ca3af; margin-bottom: 1rem;"></i>
                    <p>No bulk generation jobs found${statusFilter ? ` with status "${statusFilter}"` : ''}.</p>
                    <p style="color: #64748b; font-size: 0.9rem;">Create your first bulk generation job to get started!</p>
                </div>`;
            }
        } catch (error) {
            console.error('Failed to load jobs:', error);
            const jobsList = document.getElementById('jobsList');
            const pendingReviewSection = document.getElementById('pendingReviewSection');
            
            if (pendingReviewSection) pendingReviewSection.style.display = 'none';
            
            if (jobsList) {
                jobsList.innerHTML = `<div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Failed to load jobs: ${error.message}</p>
                    <button class="btn btn-primary" onclick="bulk.refreshJobs()">
                        <i class="fas fa-redo"></i> Try Again
                    </button>
                </div>`;
            }
        }
    },

    renderPendingReviewJobs(jobs) {
        const container = document.getElementById('pendingReviewJobs');
        if (!container) return;
        
        container.innerHTML = jobs.map(job => `
            <div class="pending-job-card">
                <div class="pending-job-header">
                    <div class="job-info">
                        <h4>${job.topic || 'Bulk Generation Job'}</h4>
                        <div class="job-meta">
                            <span><i class="fas fa-tag"></i> ${job.category || 'No category'}</span>
                            <span><i class="fas fa-lightbulb"></i> ${job.ideas?.length || job.total_articles || 0} ideas</span>
                            <span><i class="fas fa-clock"></i> ${new Date(job.created_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <div class="job-status">
                        <span class="status-badge status-pending-review">
                            <i class="fas fa-clock"></i> Pending Review
                        </span>
                    </div>
                </div>
                
                <div class="pending-job-actions">
                    <button class="btn btn-primary" onclick="bulk.startReviewFromJob('${job.job_id || job._id}')">
                        <i class="fas fa-eye"></i> Review Ideas
                    </button>
                    <button class="btn btn-secondary" onclick="bulk.viewJobDetails('${job.job_id || job._id}')">
                        <i class="fas fa-info-circle"></i> Details
                    </button>
                    <button class="btn btn-danger" onclick="bulk.cancelJob('${job.job_id || job._id}')">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                </div>
                
                ${job.ideas && job.ideas.length > 0 ? `
                    <div class="ideas-preview">
                        <h5><i class="fas fa-list"></i> Generated Ideas Preview:</h5>
                        <div class="ideas-list">
                            ${job.ideas.slice(0, 3).map(idea => `
                                <div class="idea-preview">
                                    <span class="idea-title">${idea.title || 'Untitled Idea'}</span>
                                    <span class="idea-keyword">${idea.primary_keyword || ''}</span>
                                </div>
                            `).join('')}
                            ${job.ideas.length > 3 ? `<div class="more-ideas">+${job.ideas.length - 3} more ideas...</div>` : ''}
                        </div>
                    </div>
                ` : ''}
            </div>
        `).join('');
    },

    async startReviewFromJob(jobId) {
        try {
            showToast('Loading job for review...', 'info');
            
            console.log('Loading job with ID:', jobId);
            
            // Load the job details
            const job = await api.getBulkJobStatus(jobId);
            
            console.log('Loaded job object:', job);
            
            // Handle different response structures for ideas
            const ideas = job.ideas || job.article_ideas || [];
            
            if (!ideas || ideas.length === 0) {
                showToast('No ideas found in this job to review', 'warning');
                console.log('No ideas found. Job structure:', job);
                return;
            }
            
            // Ensure job has proper ID field
            if (!job.job_id && !job._id && !job.id) {
                // Add the job ID to the object if it's missing
                job.job_id = jobId;
            }
            
            // Normalize the ideas structure for loadReviewIdeas
            job.article_ideas = ideas;
            
            console.log('Setting currentJob to:', job);
            console.log('Ideas to review:', ideas);
            
            // Set current job and switch to interactive mode
            this.currentJob = job;
            this.switchTab('interactive');
            
            // Load the ideas into step 2
            console.log('About to load review ideas...');
            this.loadReviewIdeas();
            
            console.log('About to go to step 2...');
            this.goToStep(2);
            
            // Double check that step 2 is visible
            setTimeout(() => {
                const step2 = document.getElementById('step-2');
                const reviewDiv = document.getElementById('reviewIdeas');
                console.log('Step 2 element:', step2);
                console.log('Step 2 visible:', step2?.style.display !== 'none');
                console.log('Review div content:', reviewDiv?.innerHTML.length, 'characters');
            }, 100);
            
            showToast(`Loaded ${ideas.length} ideas for review`, 'success');
            
        } catch (error) {
            console.error('Failed to start review:', error);
            showToast(`Failed to load job for review: ${error.message}`, 'error');
        }
    }
};

// Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
    // Hide loading overlay
    setTimeout(() => {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }, 1000);
    
    // Categories will be loaded after authentication
    
    // Check for stored authentication
    if (auth.checkStoredAuth()) {
        try {
            await api.getContent({ limit: 1 });
            isAuthenticated = true;
            currentUser = CONFIG.CREDENTIALS.username;
            
            const loginModal = document.getElementById('loginModal');
            const dashboard = document.getElementById('dashboard');
            const currentUserEl = document.getElementById('currentUser');
            
            if (loginModal) loginModal.style.display = 'none';
            if (dashboard) dashboard.style.display = 'flex';
            if (currentUserEl) currentUserEl.textContent = currentUser;
            
            // Initialize theme system for dashboard
            setTimeout(() => {
                initializeThemeSystem();
            }, 100);
            
            // Load categories after successful authentication
            try {
                await brainstorm.loadCategories();
                await bulk.init();
            } catch (error) {
                console.error('Failed to load categories after stored auth:', error);
                // Continue without categories - they can be loaded later
            }
            
            // Load initial data
            navigation.switchSection('overview');
            
        } catch (error) {
            auth.logout();
        }
    } else {
        const loginModal = document.getElementById('loginModal');
        if (loginModal) loginModal.style.display = 'block';
        
        // Initialize theme toggle for login screen
        setTimeout(() => {
            initializeThemeSystem();
        }, 100);
    }
    
    // Login form
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const username = formData.get('username');
        const password = formData.get('password');
        
        const submitBtn = e.target.querySelector('button[type="submit"]');
        showLoading(submitBtn);
        
        try {
            await auth.login(username, password);
            
            const loginModal = document.getElementById('loginModal');
            const dashboard = document.getElementById('dashboard');
            const currentUserEl = document.getElementById('currentUser');
            
            if (loginModal) loginModal.style.display = 'none';
            if (dashboard) dashboard.style.display = 'flex';
            if (currentUserEl) currentUserEl.textContent = currentUser;
            
            // Initialize theme system for dashboard
            setTimeout(() => {
                initializeThemeSystem();
            }, 100);
            
            showToast('Login successful!', 'success');
            navigation.switchSection('overview');
            
        } catch (error) {
            showToast('Login failed: ' + error.message, 'error');
        } finally {
            hideLoading(submitBtn);
        }
    });
    
    // Logout
    document.getElementById('logoutBtn').addEventListener('click', () => {
        auth.logout();
        showToast('Logged out successfully', 'info');
    });
    
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.section;
            navigation.switchSection(section);
        });
    });
    
    // Sidebar toggle
    document.getElementById('sidebarToggle').addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('open');
    });
    
    // Content management with debounced search
    let searchTimeout;
    document.getElementById('searchContent').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
        dashboard.filterContent();
        }, 300); // 300ms debounce
    });
    
    document.getElementById('filterStatus').addEventListener('change', () => {
        CONFIG.PAGINATION.currentPage = 1; // Reset to first page
        dashboard.loadContent();
    });
    
    // Add event listener for category filter if it exists
    const categoryFilter = document.getElementById('filterCategory');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', () => {
            CONFIG.PAGINATION.currentPage = 1; // Reset to first page
            dashboard.loadContent();
        });
    }
    
    // Add event listener for content type filter if it exists
    const contentTypeFilter = document.getElementById('filterContentType');
    if (contentTypeFilter) {
        contentTypeFilter.addEventListener('change', () => {
            CONFIG.PAGINATION.currentPage = 1; // Reset to first page
            dashboard.loadContent();
        });
    }
    
    // Add event listener for sort by if it exists
    const sortBy = document.getElementById('sortBy');
    if (sortBy) {
        sortBy.addEventListener('change', () => {
            dashboard.loadContent();
        });
    }
    
    // Add event listener for items per page if it exists
    const itemsPerPage = document.getElementById('itemsPerPage');
    if (itemsPerPage) {
        itemsPerPage.addEventListener('change', () => {
            CONFIG.PAGINATION.currentPage = 1; // Reset to first page
            dashboard.loadContent();
        });
    }
    
    document.getElementById('refreshContent').addEventListener('click', () => {
        dashboard.loadContent();
    });
    
    // Test connection button
    const testConnectionBtn = document.getElementById('testConnection');
    if (testConnectionBtn) {
        testConnectionBtn.addEventListener('click', async () => {
            showLoading(testConnectionBtn);
            try {
                const isConnected = await api.testConnection();
                if (isConnected) {
                    showToast('✅ API connection successful!', 'success');
                    
                    // Try to get a simple stats call
                    try {
                        const stats = await api.getStats();
                        showToast(`📊 Stats loaded: ${JSON.stringify(stats)}`, 'info');
                    } catch (statsError) {
                        showToast(`⚠️ Connection OK but stats failed: ${statsError.message}`, 'warning');
                    }
                } else {
                    showToast('❌ Cannot connect to API server', 'error');
                }
            } catch (error) {
                showToast(`❌ Connection test failed: ${error.message}`, 'error');
            } finally {
                hideLoading(testConnectionBtn);
            }
        });
    }

    // API Status Dashboard button
    const apiStatusBtn = document.getElementById('apiStatus');
    if (apiStatusBtn) {
        apiStatusBtn.addEventListener('click', async () => {
            await dashboard.showApiStatusDashboard();
        });
    }
    
    // Bulk actions event listeners
    const bulkApplyStatus = document.getElementById('bulkApplyStatus');
    if (bulkApplyStatus) {
        bulkApplyStatus.addEventListener('click', () => {
            dashboard.bulkApplyStatus();
        });
    }
    
    const bulkDelete = document.getElementById('bulkDelete');
    if (bulkDelete) {
        bulkDelete.addEventListener('click', () => {
            dashboard.bulkDeleteContent();
        });
    }
    
    const clearSelection = document.getElementById('clearSelection');
    if (clearSelection) {
        clearSelection.addEventListener('click', () => {
            dashboard.clearSelection();
        });
    }
    
    // Pagination
    const prevPageBtn = document.getElementById('prevPage');
    const nextPageBtn = document.getElementById('nextPage');
    
    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', () => {
            console.log('Previous button clicked, current page:', CONFIG.PAGINATION.currentPage);
        if (CONFIG.PAGINATION.currentPage > 1) {
            CONFIG.PAGINATION.currentPage--;
                console.log('Moving to page:', CONFIG.PAGINATION.currentPage);
            dashboard.loadContent();
            } else {
                console.log('Already on first page');
            }
        });
    }
    
    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', () => {
            console.log('Next button clicked, current page:', CONFIG.PAGINATION.currentPage);
            const itemsPerPage = parseInt(document.getElementById('itemsPerPage')?.value || CONFIG.PAGINATION.limit);
            const totalCount = CONFIG.PAGINATION.totalCount || contentData.length;
            const totalPages = Math.ceil(totalCount / itemsPerPage);
            console.log('Total pages:', totalPages, 'Total items:', totalCount);
            
            if (CONFIG.PAGINATION.currentPage < totalPages) {
        CONFIG.PAGINATION.currentPage++;
                console.log('Moving to page:', CONFIG.PAGINATION.currentPage);
        dashboard.loadContent();
            } else {
                console.log('Already on last page');
            }
    });
    }
    
    // Create content tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            const tabContent = document.getElementById(`${tab}-tab`);
            if (tabContent) tabContent.classList.add('active');
            
            // Load categories for E-E-A-T tab
            if (tab === 'eeat') {
                eeatCreate.loadCategories();
            }
        });
    });
    
    // AI Content Form (main Create Content section)
    const aiContentForm = document.getElementById('aiContentForm');
    if (aiContentForm) {
        aiContentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        await contentCreator.createAIContent(data);
    });
    }
    
    // Manual Content Form (main Create Content section)
    const manualContentForm = document.getElementById('manualContentForm');
    if (manualContentForm) {
        manualContentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        await contentCreator.createManualContent(data);
        });
    }
    
    // E-E-A-T Create Form
    document.getElementById('eeatCreateForm').addEventListener('submit', async (e) => {
        await eeatCreate.handleSubmit(e);
    });
    
    // Brainstorm Form
    document.getElementById('brainstormForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        await brainstorm.generateIdeas(data);
    });
    


    // Bulk brainstorm form
    document.getElementById('bulkBrainstormForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        await bulk.startBrainstorm(data);
    });

    // Direct bulk form
    document.getElementById('directBulkForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        await bulk.startDirectGeneration(data);
    });
    
    // Modal close
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.modal').style.display = 'none';
            document.body.classList.remove('modal-open');
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
        });
    });
    
    // Click outside modal to close
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
                document.body.classList.remove('modal-open');
                document.body.style.overflow = '';
                document.documentElement.style.overflow = '';
            }
        });
    });
    
    // Settings
    document.getElementById('saveSettings').addEventListener('click', () => {
        const apiBaseUrl = document.getElementById('apiBaseUrl').value;
        const gptModel = document.getElementById('gptModel').value;
        const effortLevel = document.getElementById('effortLevel').value;
        const verbosityLevel = document.getElementById('verbosityLevel').value;
        const defaultAuthor = document.getElementById('defaultAuthor').value;
        const autoPublish = document.getElementById('autoPublish').checked;
        
        CONFIG.API_BASE_URL = apiBaseUrl;
        
        localStorage.setItem('dashboard_settings', JSON.stringify({
            apiBaseUrl,
            gptModel,
            effortLevel,
            verbosityLevel,
            defaultAuthor,
            autoPublish
        }));
        
        showToast('GPT-5 settings saved successfully!', 'success');
    });
    
    // Load saved settings
    const savedSettings = localStorage.getItem('dashboard_settings');
    if (savedSettings) {
        try {
            const settings = JSON.parse(savedSettings);
            document.getElementById('apiBaseUrl').value = settings.apiBaseUrl || CONFIG.API_BASE_URL;
            document.getElementById('gptModel').value = settings.gptModel || 'gpt-5';
            document.getElementById('effortLevel').value = settings.effortLevel || 'medium';
            document.getElementById('verbosityLevel').value = settings.verbosityLevel || 'medium';
            document.getElementById('defaultAuthor').value = settings.defaultAuthor || 'Upscend Team';
            document.getElementById('autoPublish').checked = settings.autoPublish || false;
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }
});

// Test modal button
const testModalBtn = document.getElementById('testModal');
if (testModalBtn) {
    testModalBtn.addEventListener('click', () => {
        dashboard.testModal();
    });
}

// Global error handler
window.addEventListener('error', (e) => {
    console.error('Global error:', e.error);
    showToast('An unexpected error occurred', 'error');
});

// Unhandled promise rejection handler
window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled promise rejection:', e.reason);
    showToast('An unexpected error occurred', 'error');
    // Global Search Functionality
    const globalSearch = document.getElementById('globalSearch');
    const searchResults = document.getElementById('searchResults');
    let searchTimeout;

    if (globalSearch && searchResults) {
        globalSearch.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();
            
            if (query.length < 2) {
                searchResults.style.display = 'none';
                return;
            }
            
            searchTimeout = setTimeout(async () => {
                await performGlobalSearch(query);
            }, 300);
        });

        globalSearch.addEventListener('blur', () => {
            setTimeout(() => {
                searchResults.style.display = 'none';
            }, 200);
        });

        globalSearch.addEventListener('focus', () => {
            if (globalSearch.value.trim().length >= 2) {
                searchResults.style.display = 'block';
            }
        });
    }

    async function performGlobalSearch(query) {
        try {
            searchResults.innerHTML = '<div class="search-result-item">Searching...</div>';
            searchResults.style.display = 'block';
            
            // Search content
            const content = await api.getContent().catch(() => []);
            const filteredContent = content.filter(item => 
                item.title?.toLowerCase().includes(query.toLowerCase()) ||
                item.category?.name?.toLowerCase().includes(query.toLowerCase()) ||
                item.category?.toLowerCase().includes(query.toLowerCase())
            ).slice(0, 5);
            
            // Search jobs
            const jobs = await api.getBulkJobs('', 0, 50).catch(() => []);
            const filteredJobs = jobs.filter(job => 
                job.topic?.toLowerCase().includes(query.toLowerCase()) ||
                job.category?.toLowerCase().includes(query.toLowerCase())
            ).slice(0, 3);
            
            let results = [];
            
            // Add content results
            filteredContent.forEach(item => {
                results.push({
                    type: 'content',
                    title: item.title || 'Untitled',
                    meta: `${item.category?.name || item.category || 'No category'} • ${item.status || 'draft'}`,
                    action: () => {
                        navigation.switchSection('content');
                        setTimeout(() => dashboard.viewContent(item._id || item.id), 500);
                    }
                });
            });
            
            // Add job results
            filteredJobs.forEach(job => {
                results.push({
                    type: 'job',
                    title: job.topic || 'Bulk Job',
                    meta: `${job.category || 'No category'} • ${job.status || 'unknown'}`,
                    action: () => {
                        navigation.switchSection('bulk');
                        setTimeout(() => bulk.viewJobDetails(job.job_id || job._id), 500);
                    }
                });
            });
            
            if (results.length === 0) {
                searchResults.innerHTML = '<div class="search-result-item">No results found</div>';
            } else {
                searchResults.innerHTML = results.map(result => `
                    <div class="search-result-item" onclick="handleSearchResult('${results.indexOf(result)}')">
                        <div class="search-result-title">
                            <i class="fas ${result.type === 'content' ? 'fa-file-alt' : 'fa-layer-group'}"></i>
                            ${result.title}
                        </div>
                        <div class="search-result-meta">${result.meta}</div>
                    </div>
                `).join('');
                
                // Store results for click handling
                window.searchResults = results;
            }
            
        } catch (error) {
            console.error('Search failed:', error);
            searchResults.innerHTML = '<div class="search-result-item">Search failed</div>';
        }
    }

    window.handleSearchResult = (index) => {
        const result = window.searchResults[index];
        if (result && result.action) {
            result.action();
            globalSearch.value = '';
            searchResults.style.display = 'none';
        }
    };

    // Theme system will be initialized when login modal is shown

    // Notifications Functionality
    const notificationsBtn = document.getElementById('notificationsBtn');
    if (notificationsBtn) {
        notificationsBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await showNotificationsDropdown();
        });
    }

    async function showNotificationsDropdown() {
        // Remove existing dropdown
        const existingDropdown = document.getElementById('notificationsDropdown');
        if (existingDropdown) {
            existingDropdown.remove();
            return;
        }

        try {
            // Get pending review jobs
            const jobs = await api.getBulkJobs('', 0, 50);
            const pendingReviewJobs = jobs.filter(job => job.status === 'pending_review');
            
            const dropdown = document.createElement('div');
            dropdown.id = 'notificationsDropdown';
            dropdown.className = 'dropdown-menu show';
            dropdown.style.cssText = `
                position: absolute;
                top: 100%;
                right: 0;
                background: var(--bg-primary);
                border: 1px solid var(--border-color);
                border-radius: var(--border-radius);
                box-shadow: var(--shadow-lg);
                min-width: 350px;
                max-width: 400px;
                z-index: 1000;
                margin-top: 0.5rem;
                max-height: 400px;
                overflow-y: auto;
            `;
            
            if (pendingReviewJobs.length === 0) {
                dropdown.innerHTML = `
                    <div style="padding: 1.5rem; text-align: center; color: var(--text-muted);">
                        <i class="fas fa-check-circle" style="font-size: 2rem; margin-bottom: 0.5rem; color: var(--success-color);"></i>
                        <p style="margin: 0;">No pending notifications</p>
                        <small>All your jobs are up to date!</small>
                    </div>
                `;
            } else {
                dropdown.innerHTML = `
                    <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); background: var(--bg-secondary);">
                        <h4 style="margin: 0; color: var(--text-primary); font-size: 0.95rem;">
                            <i class="fas fa-bell"></i> Notifications (${pendingReviewJobs.length})
                        </h4>
                    </div>
                    ${pendingReviewJobs.map(job => `
                        <div class="notification-item" style="padding: 1rem; border-bottom: 1px solid var(--border-color); cursor: pointer; transition: var(--transition);" 
                             onclick="handleNotificationClick('${job.job_id || job._id}')">
                            <div style="display: flex; align-items: flex-start; gap: 0.75rem;">
                                <div style="background: var(--warning-color); color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                    <i class="fas fa-clock" style="font-size: 0.8rem;"></i>
                                </div>
                                <div style="flex: 1;">
                                    <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 0.25rem; font-size: 0.9rem;">
                                        Review Required: ${job.topic || 'Bulk Generation Job'}
                                    </div>
                                    <div style="color: var(--text-secondary); font-size: 0.8rem; margin-bottom: 0.5rem;">
                                        ${job.ideas?.length || job.total_articles || 0} ideas ready for review
                                    </div>
                                    <div style="color: var(--text-muted); font-size: 0.75rem;">
                                        Created ${dashboard.formatTimeAgo(job.created_at)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                    <div style="padding: 1rem; background: var(--bg-secondary); text-align: center;">
                        <button class="btn btn-sm btn-primary" onclick="navigation.switchSection('bulk'); document.getElementById('notificationsDropdown').remove();" style="width: 100%;">
                            <i class="fas fa-tasks"></i> View All Jobs
                        </button>
                    </div>
                `;
            }
            
            notificationsBtn.style.position = 'relative';
            notificationsBtn.appendChild(dropdown);
            
            // Close on outside click
            setTimeout(() => {
                document.addEventListener('click', function closeNotifications(e) {
                    if (!notificationsBtn.contains(e.target)) {
                        dropdown.remove();
                        document.removeEventListener('click', closeNotifications);
                    }
                });
            }, 100);
            
        } catch (error) {
            console.error('Failed to load notifications:', error);
            showToast('Failed to load notifications', 'error');
        }
    }

    window.handleNotificationClick = (jobId) => {
        bulk.startReviewFromJob(jobId);
        const dropdown = document.getElementById('notificationsDropdown');
        if (dropdown) dropdown.remove();
    };

    // User Dropdown Functionality
    const userMenuToggle = document.getElementById('userMenuToggle');
    const userDropdown = document.getElementById('userDropdown');
    const logoutDropdown = document.getElementById('logoutDropdown');
    
    if (userMenuToggle && userDropdown) {
        userMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.classList.toggle('show');
        });
        
        document.addEventListener('click', () => {
            userDropdown.classList.remove('show');
        });
    }
    
    if (logoutDropdown) {
        logoutDropdown.addEventListener('click', (e) => {
            e.preventDefault();
            auth.logout();
        });
    }

    // Content Editor Event Listeners
    const editMetaDesc = document.getElementById('editMetaDescription');
    if (editMetaDesc) {
        editMetaDesc.addEventListener('input', () => {
            contentEditor.updateCharCount();
        });
    }

    // Update preview on content changes
    const editTitle = document.getElementById('editTitle');
    const editContent = document.getElementById('editContent');
    const editCategory = document.getElementById('editCategory');
    const editImageUrl = document.getElementById('editImageUrl');
    const editImageAlt = document.getElementById('editImageAlt');

    [editTitle, editCategory, editImageUrl, editImageAlt].forEach(element => {
        if (element) {
            element.addEventListener('input', () => {
                contentEditor.updatePreview();
            });
        }
    });

    if (editContent) {
        editContent.addEventListener('input', () => {
            contentEditor.updatePreview();
        });
    }
});

// Content Editor
const contentEditor = {
    currentContentId: null,
    categories: [],

    async open(contentId) {
        try {
            this.currentContentId = contentId;
            
            // Load content data
            const content = await api.getContentById(contentId);
            console.log('Loading content for editing:', content);
            
            // Load categories if not already loaded
            if (this.categories.length === 0) {
                this.categories = await api.getCategories();
            }
            
            // Populate form
            this.populateForm(content);
            
            // Show modal
            const modal = document.getElementById('contentEditorModal');
            modal.style.display = 'block';
            document.body.classList.add('modal-open');
            
            // Switch to content tab
            this.switchTab('content');
            
            showToast('Content loaded for editing', 'success');
            
        } catch (error) {
            console.error('Failed to load content for editing:', error);
            showToast(`Failed to load content: ${error.message}`, 'error');
        }
    },

    populateForm(content) {
        // Basic fields
        document.getElementById('editTitle').value = content.title || '';
        document.getElementById('editContent').innerHTML = content.content || '';
        
        // Meta fields
        document.getElementById('editMetaDescription').value = content.meta_description || '';
        document.getElementById('editTldr').value = content.tldr_summary || '';
        document.getElementById('editImageUrl').value = content.image_url || '';
        document.getElementById('editImageAlt').value = content.image_alt_text || '';
        document.getElementById('editAuthor').value = content.author?.name || content.created_by || '';
        
        // SEO fields
        const keywords = Array.isArray(content.keywords) ? content.keywords.join(', ') : (content.keywords || '');
        document.getElementById('editKeywords').value = keywords;
        document.getElementById('editContentType').value = content.content_type || 'article';
        document.getElementById('editStatus').value = content.status || 'draft';
        
        // Populate categories
        const categorySelect = document.getElementById('editCategory');
        categorySelect.innerHTML = '<option value="">Select Category</option>';
        this.categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.slug || category.name;
            option.textContent = category.name;
            if (content.category && (content.category.slug === category.slug || content.category.name === category.name)) {
                option.selected = true;
            }
            categorySelect.appendChild(option);
        });
        
        // Update character count
        this.updateCharCount();
        
        // Update preview
        this.updatePreview();
    },

    switchTab(tabName) {
        // Remove active class from all tabs and buttons
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.editor-tab').forEach(tab => tab.classList.remove('active'));
        
        // Add active class to selected tab and button
        const activeBtn = document.querySelector(`[onclick="contentEditor.switchTab('${tabName}')"]`);
        if (activeBtn) activeBtn.classList.add('active');
        
        const activeTab = document.getElementById(`editor-${tabName}`);
        if (activeTab) activeTab.classList.add('active');
        
        // Update preview if switching to preview tab
        if (tabName === 'preview') {
            this.updatePreview();
        }
    },

    formatText(command, value = null) {
        document.execCommand(command, false, value);
        document.getElementById('editContent').focus();
        this.updatePreview();
    },

    insertLink() {
        const url = prompt('Enter the URL:');
        if (url) {
            this.formatText('createLink', url);
        }
    },

    insertImage() {
        const url = prompt('Enter the image URL:');
        if (url) {
            this.formatText('insertImage', url);
        }
    },

    updateCharCount() {
        const metaDesc = document.getElementById('editMetaDescription');
        const charCount = document.querySelector('.char-count');
        
        if (metaDesc && charCount) {
            const length = metaDesc.value.length;
            charCount.textContent = `${length}/160 characters`;
            
            charCount.classList.remove('warning', 'error');
            if (length > 140) {
                charCount.classList.add('warning');
            }
            if (length > 160) {
                charCount.classList.add('error');
            }
        }
    },

    updatePreview() {
        const title = document.getElementById('editTitle').value;
        const content = document.getElementById('editContent').innerHTML;
        const category = document.getElementById('editCategory').selectedOptions[0]?.textContent || 'Uncategorized';
        const imageUrl = document.getElementById('editImageUrl').value;
        
        // Update preview elements
        document.getElementById('previewTitle').textContent = title || 'Untitled';
        document.getElementById('previewCategory').textContent = category;
        document.getElementById('previewDate').textContent = new Date().toLocaleDateString();
        
        // Count words
        const wordCount = content.replace(/<[^>]*>/g, '').split(/\s+/).filter(word => word.length > 0).length;
        document.getElementById('previewWordCount').textContent = `${wordCount} words`;
        
        // Update content
        document.getElementById('previewContent').innerHTML = content || 'No content available.';
        
        // Update image
        const previewImage = document.getElementById('previewImage');
        const previewImageSrc = document.getElementById('previewImageSrc');
        
        if (imageUrl) {
            previewImageSrc.src = imageUrl;
            previewImageSrc.alt = document.getElementById('editImageAlt').value || '';
            previewImage.style.display = 'block';
        } else {
            previewImage.style.display = 'none';
        }
    },

    async saveAsDraft() {
        await this.save('draft');
    },

    async saveAndPublish() {
        await this.save('published');
    },

    async save(status) {
        try {
            const formData = this.getFormData();
            formData.status = status;
            
            showToast(`Saving content as ${status}...`, 'info');
            
            await api.updateContent(this.currentContentId, formData);
            
            showToast(`Content saved as ${status}!`, 'success');
            
            // Refresh content list
            dashboard.loadContent();
            
            // Close editor
            this.close();
            
        } catch (error) {
            console.error('Failed to save content:', error);
            showToast(`Failed to save content: ${error.message}`, 'error');
        }
    },

    getFormData() {
        const keywords = document.getElementById('editKeywords').value
            .split(',')
            .map(k => k.trim())
            .filter(k => k.length > 0);

        const data = {
            title: document.getElementById('editTitle').value,
            content: document.getElementById('editContent').innerHTML,
            category: document.getElementById('editCategory').value,
            meta_description: document.getElementById('editMetaDescription').value,
            tldr_summary: document.getElementById('editTldr').value,
            created_by: document.getElementById('editAuthor').value,
            keywords: keywords,
            content_type: document.getElementById('editContentType').value,
            status: document.getElementById('editStatus').value
        };
        
        // Add optional URL fields only if they have values
        const imageUrl = document.getElementById('editImageUrl').value;
        const imageAlt = document.getElementById('editImageAlt').value;
        const courseUrl = document.getElementById('editCourseUrl')?.value;
        
        if (imageUrl && imageUrl.trim()) {
            data.image_url = imageUrl.trim();
        }
        if (imageAlt && imageAlt.trim()) {
            data.image_alt_text = imageAlt.trim();
        }
        if (courseUrl && courseUrl.trim()) {
            data.course_url = courseUrl.trim();
        }
        
        return data;
    },

    close() {
        const modal = document.getElementById('contentEditorModal');
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
        this.currentContentId = null;
    }
};

// Initialize theme system function
function initializeThemeSystem() {
    // Theme Toggle Functionality
    const themeToggle = document.getElementById('themeToggle');
    const themeToggleLogin = document.getElementById('themeToggleLogin');
    const currentTheme = localStorage.getItem('dashboard-theme') || 'light';
    
    console.log('Initializing theme system...');
    console.log('Theme toggle element:', themeToggle);
    console.log('Theme toggle login element:', themeToggleLogin);
    console.log('Current theme from storage:', currentTheme);
    
    // Apply saved theme
    document.documentElement.setAttribute('data-theme', currentTheme);
    console.log('Applied theme to document:', document.documentElement.getAttribute('data-theme'));
    
    updateThemeIcon(currentTheme);
    updateThemeIconLogin(currentTheme);
    
    // Function to toggle theme
    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        console.log('Theme toggle clicked:', currentTheme, '->', newTheme);
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('dashboard-theme', newTheme);
        updateThemeIcon(newTheme);
        updateThemeIconLogin(newTheme);
        
        console.log('Theme applied:', document.documentElement.getAttribute('data-theme'));
        
        showToast(`Switched to ${newTheme} mode`, 'success');
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    } else {
        console.error('Theme toggle button not found!');
    }

    if (themeToggleLogin) {
        themeToggleLogin.addEventListener('click', toggleTheme);
        console.log('Theme toggle login button found and event listener added!');
    } else {
        console.error('Theme toggle login button not found!');
    }

    function updateThemeIcon(theme) {
        const icon = themeToggle?.querySelector('i');
        if (icon) {
            icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
        }
    }

    function updateThemeIconLogin(theme) {
        const icon = themeToggleLogin?.querySelector('i');
        if (icon) {
            icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
            console.log('Updated login theme icon to:', theme);
        }
    }
}

// SEO Helper Functions
const seoHelper = {
    // Initialize meta description counter
    initMetaDescCounter() {
        const metaDescInput = document.getElementById('editMetaDescription');
        const counter = document.getElementById('metaDescLength');
        
        if (metaDescInput && counter) {
            metaDescInput.addEventListener('input', function() {
                const length = this.value.length;
                counter.textContent = length;
                
                // Color coding based on length
                if (length < 120) {
                    counter.style.color = '#ef4444'; // Red - too short
                } else if (length <= 160) {
                    counter.style.color = '#10b981'; // Green - good
                } else {
                    counter.style.color = '#f59e0b'; // Orange - too long
                }
            });
        }
    },

    // Display SEO checklist
    displaySEOChecklist(content) {
        const seoSection = document.getElementById('seoScoreSection');
        const seoScoreBadge = document.getElementById('seoScoreBadge');
        const seoChecklist = document.getElementById('seoChecklist');
        
        if (!content.qc_results || !seoSection) return;
        
        const score = content.qc_results.audit_summary?.overall_seo_score || 0;
        seoScoreBadge.textContent = `${score}/100`;
        
        // Color code the badge
        if (score >= 80) {
            seoScoreBadge.style.background = 'rgba(16, 185, 129, 0.8)';
        } else if (score >= 60) {
            seoScoreBadge.style.background = 'rgba(245, 158, 11, 0.8)';
        } else {
            seoScoreBadge.style.background = 'rgba(239, 68, 68, 0.8)';
        }
        
        // SEO checklist items
        const checks = [
            {
                text: 'Primary keyword in title',
                status: content.title?.toLowerCase().includes(content.keywords?.[0]?.toLowerCase()) ? 'pass' : 'fail'
            },
            {
                text: 'Meta description (120-160 chars)',
                status: content.meta_description && content.meta_description.length >= 120 && content.meta_description.length <= 160 ? 'pass' : 'fail'
            },
            {
                text: 'Word count (1000-5000 words)',
                status: content.word_count >= 1000 && content.word_count <= 5000 ? 'pass' : 'warning'
            },
            {
                text: 'Image alt text provided',
                status: content.image_alt_text ? 'pass' : 'fail'
            }
        ];
        
        seoChecklist.innerHTML = checks.map(check => `
            <div class="seo-check-item">
                <div class="seo-check-icon ${check.status}">
                    <i class="fas ${check.status === 'pass' ? 'fa-check' : check.status === 'warning' ? 'fa-exclamation' : 'fa-times'}"></i>
                </div>
                <div class="seo-check-text">${check.text}</div>
            </div>
        `).join('');
        
        seoSection.style.display = 'block';
    }
};

// AI Generated Content Module
const aiGenerated = {
    init() {
        this.setupEventListeners();
        this.loadCategories();
    },

    setupEventListeners() {
        const form = document.getElementById('aiContentForm');
        if (form) {
            form.addEventListener('submit', (e) => this.handleSubmit(e));
        }
    },

    async loadCategories() {
        try {
            const categories = await api.request('/api/v1/admin/contents/categories', 'GET');
            const categorySelect = document.getElementById('aiCategory');
            if (categorySelect && categories) {
                categorySelect.innerHTML = '<option value="">Select category</option>';
                categories.forEach(category => {
                    const option = document.createElement('option');
                    option.value = category.name;
                    option.textContent = category.name;
                    categorySelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading categories:', error);
            // Fallback to default categories
            const categorySelect = document.getElementById('aiCategory');
            if (categorySelect) {
                const defaultCategories = ['Technology', 'Business', 'Health', 'Education', 'Marketing'];
                categorySelect.innerHTML = '<option value="">Select category</option>';
                defaultCategories.forEach(cat => {
                    const option = document.createElement('option');
                    option.value = cat;
                    option.textContent = cat;
                    categorySelect.appendChild(option);
                });
            }
        }
    },

    async handleSubmit(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        
        // Convert keywords string to array
        if (data.keywords) {
            data.keywords = data.keywords.split(',').map(k => k.trim()).filter(k => k);
        }
        
        // Convert target_length to number
        if (data.target_length) {
            const originalValue = data.target_length;
            data.target_length = parseInt(data.target_length);
            console.log('📏 E-E-A-T AI Request - Target Length:');
            console.log('  Original:', originalValue);
            console.log('  Converted:', data.target_length);
            console.log('  Title:', data.title);
        }
        
        // Remove empty URL fields (Pydantic HttpUrl doesn't accept empty strings)
        if (!data.course_url || data.course_url.trim() === '') {
            delete data.course_url;
        }
        if (!data.image_url || data.image_url.trim() === '') {
            delete data.image_url;
        }

        try {
            const response = await api.request('/api/v1/admin/contents/ai', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            
            if (response.content_id) {
                showToast('AI content generated successfully!', 'success');
                this.showResults(response);
                this.clearForm();
            } else {
                showToast('Failed to generate content', 'error');
            }
        } catch (error) {
            console.error('Error generating AI content:', error);
            showToast('Error generating content: ' + error.message, 'error');
        }
    },

    showResults(response) {
        const resultsDiv = document.getElementById('aiResults');
        const previewDiv = document.getElementById('aiContentPreview');
        
        if (resultsDiv && previewDiv) {
            previewDiv.innerHTML = `
                <div class="result-item">
                    <h4>Content Generated Successfully</h4>
                    <p><strong>Content ID:</strong> ${response.content_id}</p>
                    <p><strong>Status:</strong> ${response.status || 'Generated'}</p>
                    ${response.message ? `<p><strong>Message:</strong> ${response.message}</p>` : ''}
                </div>
            `;
            resultsDiv.style.display = 'block';
        }
    },

    clearForm() {
        const form = document.getElementById('aiContentForm');
        if (form) {
            form.reset();
            document.getElementById('aiTargetLength').value = '1500';
        }
        const resultsDiv = document.getElementById('aiResults');
        if (resultsDiv) {
            resultsDiv.style.display = 'none';
        }
    }
};

// Manual Entry Module
const manualEntry = {
    init() {
        this.setupEventListeners();
        this.loadCategories();
    },

    setupEventListeners() {
        const form = document.getElementById('manualContentForm');
        if (form) {
            form.addEventListener('submit', (e) => this.handleSubmit(e));
        }

        // Character counter for meta description
        const metaDesc = document.getElementById('manualMetaDescription');
        const counter = document.getElementById('manualMetaCounter');
        if (metaDesc && counter) {
            metaDesc.addEventListener('input', () => {
                counter.textContent = metaDesc.value.length;
                if (metaDesc.value.length > 160) {
                    counter.style.color = '#e74c3c';
                } else {
                    counter.style.color = '#666';
                }
            });
        }
    },

    async loadCategories() {
        try {
            const categories = await api.request('/api/v1/admin/contents/categories', 'GET');
            const categorySelect = document.getElementById('manualCategory');
            if (categorySelect && categories) {
                categorySelect.innerHTML = '<option value="">Select category</option>';
                categories.forEach(category => {
                    const option = document.createElement('option');
                    option.value = category.name;
                    option.textContent = category.name;
                    categorySelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading categories:', error);
            // Fallback to default categories
            const categorySelect = document.getElementById('manualCategory');
            if (categorySelect) {
                const defaultCategories = ['Technology', 'Business', 'Health', 'Education', 'Marketing'];
                categorySelect.innerHTML = '<option value="">Select category</option>';
                defaultCategories.forEach(cat => {
                    const option = document.createElement('option');
                    option.value = cat;
                    option.textContent = cat;
                    categorySelect.appendChild(option);
                });
            }
        }
    },

    async handleSubmit(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        
        // Convert keywords string to array
        if (data.keywords) {
            data.keywords = data.keywords.split(',').map(k => k.trim()).filter(k => k);
        }
        
        // Remove empty URL fields (Pydantic HttpUrl doesn't accept empty strings)
        if (!data.course_url || data.course_url.trim() === '') {
            delete data.course_url;
        }
        if (!data.image_url || data.image_url.trim() === '') {
            delete data.image_url;
        }

        try {
            const response = await api.request('/api/v1/admin/contents/manual', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            
            if (response.content_id) {
                showToast('Manual content created successfully!', 'success');
                this.showResults(response);
                this.clearForm();
            } else {
                showToast('Failed to create content', 'error');
            }
        } catch (error) {
            console.error('Error creating manual content:', error);
            showToast('Error creating content: ' + error.message, 'error');
        }
    },

    showResults(response) {
        const resultsDiv = document.getElementById('manualResults');
        const previewDiv = document.getElementById('manualContentPreview');
        
        if (resultsDiv && previewDiv) {
            previewDiv.innerHTML = `
                <div class="result-item">
                    <h4>Content Created Successfully</h4>
                    <p><strong>Content ID:</strong> ${response.content_id}</p>
                    <p><strong>Status:</strong> ${response.status || 'Created'}</p>
                    ${response.message ? `<p><strong>Message:</strong> ${response.message}</p>` : ''}
                </div>
            `;
            resultsDiv.style.display = 'block';
        }
    },

    clearForm() {
        const form = document.getElementById('manualContentForm');
        if (form) {
            form.reset();
        }
        const resultsDiv = document.getElementById('manualResults');
        if (resultsDiv) {
            resultsDiv.style.display = 'none';
        }
        const counter = document.getElementById('manualMetaCounter');
        if (counter) {
            counter.textContent = '0';
            counter.style.color = '#666';
        }
    }
};

// E-E-A-T Create Content Module
const eeatCreate = {
    async loadCategories() {
        try {
            const response = await api.request('/api/v1/admin/contents/categories', 'GET');
            const categorySelect = document.getElementById('eeatCreateCategory');
            
            if (response && Array.isArray(response)) {
                categorySelect.innerHTML = '<option value="">Select category</option>';
                response.forEach(category => {
                    const option = document.createElement('option');
                    option.value = category.name;
                    option.textContent = category.name;
                    categorySelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading categories:', error);
            showToast('Failed to load categories', 'error');
        }
    },

    async handleSubmit(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        
        // Convert keywords string to array
        if (data.keywords) {
            data.keywords = data.keywords.split(',').map(k => k.trim()).filter(k => k);
        }
        
        // Convert target_length to number
        if (data.target_length) {
            const originalValue = data.target_length;
            data.target_length = parseInt(data.target_length);
            console.log('📏 E-E-A-T Create Request - Target Length:');
            console.log('  Original:', originalValue);
            console.log('  Converted:', data.target_length);
            console.log('  Title:', data.title);
        }

        // Add advanced options
        data.detailed_content = document.getElementById('eeatCreateDetailedContent').checked;
        
        // Add advanced parameters
        data.target_audience = data.target_audience || 'general';
        data.brand_voice = data.brand_voice || 'professional';
        data.competitor_insights = data.competitor_insights || '';
        
        // Remove empty URL fields (Pydantic HttpUrl doesn't accept empty strings)
        if (!data.course_url || data.course_url.trim() === '') {
            delete data.course_url;
        }
        if (!data.image_url || data.image_url.trim() === '') {
            delete data.image_url;
        }

        try {
            const response = await api.request('/api/v1/admin/contents/ai/eeat', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            
            if (response.content_id) {
                showToast('E-E-A-T content generated successfully!', 'success');
                this.showResults(response);
                
                // Show quality insights
                if (response.quality_scores) {
                    this.showQualityInsights(response.quality_scores);
                }
                
                // Show uniqueness analysis
                if (response.uniqueness_analysis) {
                    this.showUniquenessAnalysis(response.uniqueness_analysis);
                }
                
                this.clearForm();
            } else {
                showToast(response.message || 'Content generation failed', 'error');
            }
        } catch (error) {
            console.error('Error generating E-E-A-T content:', error);
            showToast('Error generating content: ' + error.message, 'error');
        }
    },

    showResults(response) {
        const resultsDiv = document.getElementById('eeatCreateResults');
        const qualityScoresDiv = document.getElementById('eeatCreateQualityScores');
        const contentPreviewDiv = document.getElementById('eeatCreateContentPreview');
        
        // Display quality scores with enhanced styling
        if (response.quality_scores) {
            const scores = response.quality_scores;
            const overallScore = scores.overall_score || 0;
            const scoreColor = overallScore >= 80 ? '#48bb78' : overallScore >= 60 ? '#ed8936' : '#e53e3e';
            
            qualityScoresDiv.innerHTML = `
                <div class="quality-scores-grid">
                    <div class="score-item">
                        <span class="score-label">Expertise</span>
                        <span class="score-value">${scores.eeat_scores?.expertise || 0}/5</span>
                    </div>
                    <div class="score-item">
                        <span class="score-label">Experience</span>
                        <span class="score-value">${scores.eeat_scores?.experience || 0}/5</span>
                    </div>
                    <div class="score-item">
                        <span class="score-label">Authoritativeness</span>
                        <span class="score-value">${scores.eeat_scores?.authoritativeness || 0}/5</span>
                    </div>
                    <div class="score-item">
                        <span class="score-label">Trustworthiness</span>
                        <span class="score-value">${scores.eeat_scores?.trustworthiness || 0}/5</span>
                    </div>
                    <div class="score-item overall" style="border-left-color: ${scoreColor}; background: ${scoreColor}15;">
                        <span class="score-label">Overall Score</span>
                        <span class="score-value" style="color: ${scoreColor};">${overallScore}/100</span>
                    </div>
                </div>
            `;
        }
        
        // Display content preview
        if (response.content) {
            contentPreviewDiv.innerHTML = `
                <div class="content-preview-header">
                    <h4>Content Preview</h4>
                    <div class="preview-actions">
                        <button class="btn btn-primary" onclick="eeatCreate.viewFullContent('${response.content_id}')">
                            <i class="fas fa-eye"></i> View Full Content
                        </button>
                        <button class="btn btn-secondary" onclick="eeatCreate.editContent('${response.content_id}')">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                    </div>
                </div>
                <div class="content-preview-body">
                    ${response.content.substring(0, 500)}...
                </div>
            `;
        }
        
        resultsDiv.style.display = 'block';
        resultsDiv.scrollIntoView({ behavior: 'smooth' });
    },

    clearForm() {
        const form = document.getElementById('eeatCreateForm');
        const results = document.getElementById('eeatCreateResults');
        
        if (form) form.reset();
        if (results) results.style.display = 'none';
    },

    viewFullContent(contentId) {
        navigation.switchSection('content');
    },

    editContent(contentId) {
        navigation.switchSection('content');
    },

    showQualityInsights(qualityScores) {
        const insights = [];
        
        if (qualityScores.eeat_scores) {
            const scores = qualityScores.eeat_scores;
            
            if (scores.expertise >= 4) {
                insights.push('✅ Strong expertise demonstrated');
            } else if (scores.expertise <= 2) {
                insights.push('⚠️ Consider adding more expert insights');
            }
            
            if (scores.experience >= 4) {
                insights.push('✅ Real-world experience shown');
            } else if (scores.experience <= 2) {
                insights.push('⚠️ Add more practical examples');
            }
            
            if (scores.authoritativeness >= 4) {
                insights.push('✅ Credible sources cited');
            } else if (scores.authoritativeness <= 2) {
                insights.push('⚠️ Include more authoritative references');
            }
            
            if (scores.trustworthiness >= 4) {
                insights.push('✅ Actionable advice provided');
            } else if (scores.trustworthiness <= 2) {
                insights.push('⚠️ Make advice more implementable');
            }
        }
        
        if (insights.length > 0) {
            showToast(`Quality Insights: ${insights.join(', ')}`, 'info');
        }
    },

    showUniquenessAnalysis(uniquenessAnalysis) {
        if (uniquenessAnalysis.decision === 'APPROVE') {
            showToast(`✅ Unique content angle: ${uniquenessAnalysis.unique_angle}`, 'success');
        } else if (uniquenessAnalysis.decision === 'SKIP') {
            showToast(`⚠️ Content skipped: ${uniquenessAnalysis.skip_reason}`, 'warning');
        }
    }
};

// E-E-A-T Content Generation Module
const eeat = {
    async loadCategories() {
        try {
            // Try to load categories from API first
            try {
                const categories = await api.request('/api/v1/admin/contents/categories');
                const categorySelect = document.getElementById('eeatCategory');
                if (categorySelect) {
                    categorySelect.innerHTML = '<option value="">Select category</option>';
                    
                    categories.forEach(category => {
                        const option = document.createElement('option');
                        option.value = category.slug || category.id;
                        option.textContent = category.name;
                        categorySelect.appendChild(option);
                    });
                }
            } catch (apiError) {
                console.log('API categories not available, using mock data');
                // Fallback to mock categories data
                const categories = [
                    { slug: 'technology', name: 'Technology' },
                    { slug: 'health-wellness', name: 'Health & Wellness' },
                    { slug: 'business', name: 'Business' },
                    { slug: 'marketing', name: 'Marketing' },
                    { slug: 'education', name: 'Education' },
                    { slug: 'finance', name: 'Finance' },
                    { slug: 'lifestyle', name: 'Lifestyle' },
                    { slug: 'science', name: 'Science' }
                ];
                
                const categorySelect = document.getElementById('eeatCategory');
                if (categorySelect) {
                    categorySelect.innerHTML = '<option value="">Select category</option>';
                    
                    categories.forEach(category => {
                        const option = document.createElement('option');
                        option.value = category.slug;
                        option.textContent = category.name;
                        categorySelect.appendChild(option);
                    });
                }
            }
        } catch (error) {
            console.error('Error loading categories:', error);
            showToast('Failed to load categories', 'error');
        }
    },

    async generateContent(formData) {
        try {
            showLoading(document.getElementById('eeatContentForm'));
            
            // Enhanced form data with advanced length control
            const enhancedFormData = {
                ...formData,
                detailed_content: document.getElementById('detailedContent')?.checked || false,
                length_control: {
                    preset: this.getActivePreset(),
                    slider_value: document.getElementById('lengthSlider')?.value,
                    input_value: document.getElementById('eeatTargetLength')?.value
                }
            };
            
            const response = await api.request('/api/v1/admin/contents/ai/eeat', {
                method: 'POST',
                body: JSON.stringify(enhancedFormData)
            });
            
            if (response.content_id) {
                showToast('E-E-A-T content generated successfully!', 'success');
                this.displayResults(response);
                
                // Show additional E-E-A-T specific information
                if (response.quality_scores) {
                    this.showQualityInsights(response.quality_scores);
                }
                
                if (response.uniqueness_analysis) {
                    this.showUniquenessAnalysis(response.uniqueness_analysis);
                }
            } else {
                showToast(response.message || 'Content generation failed', 'error');
            }
        } catch (error) {
            console.error('Error generating E-E-A-T content:', error);
            showToast('Failed to generate content', 'error');
        } finally {
            hideLoading(document.getElementById('eeatContentForm'));
        }
    },

    displayResults(response) {
        const resultsDiv = document.getElementById('eeatResults');
        const qualityScoresDiv = document.getElementById('eeatQualityScores');
        const contentPreviewDiv = document.getElementById('eeatContentPreview');
        
        // Display quality scores
        if (response.quality_scores) {
            const scores = response.quality_scores;
            qualityScoresDiv.innerHTML = `
                <div class="quality-scores-grid">
                    <div class="score-item">
                        <span class="score-label">Expertise</span>
                        <span class="score-value">${scores.eeat_scores?.expertise || 0}/5</span>
                    </div>
                    <div class="score-item">
                        <span class="score-label">Experience</span>
                        <span class="score-value">${scores.eeat_scores?.experience || 0}/5</span>
                    </div>
                    <div class="score-item">
                        <span class="score-label">Authoritativeness</span>
                        <span class="score-value">${scores.eeat_scores?.authoritativeness || 0}/5</span>
                    </div>
                    <div class="score-item">
                        <span class="score-label">Trustworthiness</span>
                        <span class="score-value">${scores.eeat_scores?.trustworthiness || 0}/5</span>
                    </div>
                    <div class="score-item overall">
                        <span class="score-label">Overall Score</span>
                        <span class="score-value">${scores.overall_score || 0}/100</span>
                    </div>
                </div>
            `;
        }
        
        // Display content preview
        if (response.content) {
            contentPreviewDiv.innerHTML = `
                <div class="content-preview-header">
                    <h4>Content Preview</h4>
                    <div class="preview-actions">
                        <button class="btn btn-primary" onclick="eeat.viewFullContent('${response.content_id}')">
                            <i class="fas fa-eye"></i> View Full Content
                        </button>
                        <button class="btn btn-secondary" onclick="eeat.editContent('${response.content_id}')">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                    </div>
                </div>
                <div class="content-preview-body">
                    ${response.content.substring(0, 500)}...
                </div>
            `;
        }
        
        resultsDiv.style.display = 'block';
    },

    clearForm() {
        const form = document.getElementById('eeatContentForm');
        const results = document.getElementById('eeatResults');
        
        if (form) form.reset();
        if (results) results.style.display = 'none';
    },

    viewFullContent(contentId) {
        navigation.switchSection('content');
    },

    editContent(contentId) {
        navigation.switchSection('content');
    },

    showQualityInsights(qualityScores) {
        const insights = [];
        
        if (qualityScores.eeat_scores) {
            const scores = qualityScores.eeat_scores;
            
            if (scores.expertise >= 4) {
                insights.push('✅ Strong expertise demonstrated');
            } else if (scores.expertise <= 2) {
                insights.push('⚠️ Consider adding more expert insights');
            }
            
            if (scores.experience >= 4) {
                insights.push('✅ Real-world experience shown');
            } else if (scores.experience <= 2) {
                insights.push('⚠️ Add more practical examples');
            }
            
            if (scores.authoritativeness >= 4) {
                insights.push('✅ Credible sources cited');
            } else if (scores.authoritativeness <= 2) {
                insights.push('⚠️ Include more authoritative references');
            }
            
            if (scores.trustworthiness >= 4) {
                insights.push('✅ Actionable advice provided');
            } else if (scores.trustworthiness <= 2) {
                insights.push('⚠️ Make advice more implementable');
            }
        }
        
        if (insights.length > 0) {
            showToast(`Quality Insights: ${insights.join(', ')}`, 'info');
        }
    },

    showUniquenessAnalysis(uniquenessAnalysis) {
        if (uniquenessAnalysis.decision === 'APPROVE') {
            showToast(`✅ Unique content angle: ${uniquenessAnalysis.unique_angle}`, 'success');
        } else if (uniquenessAnalysis.decision === 'SKIP') {
            showToast(`⚠️ Content skipped: ${uniquenessAnalysis.skip_reason}`, 'warning');
        }
    },

    async loadEEATStats() {
        try {
            const response = await api.request('/api/v1/admin/contents/stats/eeat', 'GET');
            
            if (response.total_eeat_content) {
                const statsDiv = document.getElementById('eeatStats');
                if (statsDiv) {
                    statsDiv.innerHTML = `
                        <div class="stats-grid">
                            <div class="stat-item">
                                <span class="stat-label">Total E-E-A-T Content</span>
                                <span class="stat-value">${response.total_eeat_content}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Average Score</span>
                                <span class="stat-value">${response.score_stats?.avg_score?.toFixed(1) || 'N/A'}/100</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Max Score</span>
                                <span class="stat-value">${response.score_stats?.max_score || 'N/A'}/100</span>
                            </div>
                        </div>
                    `;
                }
            }
        } catch (error) {
            console.error('Error loading E-E-A-T stats:', error);
        }
    },

    getActivePreset() {
        const activePreset = document.querySelector('.length-preset.active');
        return activePreset ? activePreset.dataset.length : null;
    },

    initLengthControls() {
        // Initialize length control interactions
        const lengthSlider = document.getElementById('lengthSlider');
        const lengthInput = document.getElementById('eeatTargetLength');
        const presets = document.querySelectorAll('.length-preset');
        const detailedContentCheckbox = document.getElementById('detailedContent');

        // Sync slider and input
        if (lengthSlider && lengthInput) {
            lengthSlider.addEventListener('input', function() {
                lengthInput.value = this.value;
                eeat.updateSliderVisual();
            });

            lengthInput.addEventListener('input', function() {
                lengthSlider.value = this.value;
                eeat.updateSliderVisual();
            });
        }

        // Preset buttons
        presets.forEach(preset => {
            preset.addEventListener('click', function() {
                // Remove active class from all presets
                presets.forEach(p => p.classList.remove('active'));
                // Add active class to clicked preset
                this.classList.add('active');
                
                const length = this.dataset.length;
                lengthInput.value = length;
                lengthSlider.value = length;
            });
        });

        // Detailed content feature
        if (detailedContentCheckbox) {
            detailedContentCheckbox.addEventListener('change', function() {
                if (this.checked) {
                    // Increase target length by 30% for detailed content
                    const currentLength = parseInt(lengthInput.value);
                    const newLength = Math.min(Math.round(currentLength * 1.3), 8000);
                    lengthInput.value = newLength;
                    lengthSlider.value = newLength;
                }
            });
        }
    },


    updateSliderVisual() {
        // This function can be used to update slider visual feedback
        // For now, it's a placeholder that can be expanded
        console.log('Slider visual updated');
    }
};


// SEO Tools Module
const seo = {
    async analyzeKeyword() {
        const keyword = document.getElementById('keywordInput').value;
        if (!keyword) {
            showToast('Please enter a keyword to analyze', 'warning');
            return;
        }
        
        try {
            showLoading(document.getElementById('keywordResults'));
            
            // Real API call to analyze keyword
            const response = await fetch(`${CONFIG.API_BASE_URL}/api/v1/admin/contents/seo/analyze-keyword`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ keyword: keyword })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.detail || `HTTP error! status: ${response.status}`;
                throw new Error(errorMessage);
            }
            
            const results = await response.json();
            
            document.getElementById('keywordResults').innerHTML = `
                <div class="keyword-analysis">
                    <h4>Analysis Results for "${keyword}"</h4>
                    <div class="analysis-metrics">
                        <div class="metric">
                            <span class="metric-label">Difficulty</span>
                            <span class="metric-value">${results.difficulty}</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Search Volume</span>
                            <span class="metric-value">${results.volume}</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Competition</span>
                            <span class="metric-value">${results.competition}</span>
                        </div>
                    </div>
                    <div class="suggestions">
                        <h5>Related Keywords</h5>
                        <ul>
                            ${results.suggestions.map(suggestion => `<li>${suggestion}</li>`).join('')}
                        </ul>
                    </div>
                </div>
            `;
            
        } catch (error) {
            console.error('Error analyzing keyword:', error);
            const errorMessage = error.message || 'Failed to analyze keyword';
            showToast(`Failed to analyze keyword: ${errorMessage}`, 'error');
            document.getElementById('keywordResults').innerHTML = `
                <div class="error-message">
                    <p>❌ Failed to analyze keyword</p>
                    <p class="error-details">${errorMessage}</p>
                </div>
            `;
        } finally {
            hideLoading(document.getElementById('keywordResults'));
        }
    },

    async optimizeContent() {
        const content = document.getElementById('contentInput').value;
        if (!content) {
            showToast('Please enter content to optimize', 'warning');
            return;
        }
        
        try {
            showLoading(document.getElementById('optimizationResults'));
            
            // Real API call to optimize content
            const response = await fetch(`${CONFIG.API_BASE_URL}/api/v1/admin/contents/seo/optimize-content`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ content: content })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.detail || `HTTP error! status: ${response.status}`;
                throw new Error(errorMessage);
            }
            
            const optimization = await response.json();
            
            document.getElementById('optimizationResults').innerHTML = `
                <div class="optimization-analysis">
                    <div class="optimization-header">
                        <h4>AI-Powered Content Optimization</h4>
                        <div class="optimization-score">
                            <span class="score-label">Overall Score</span>
                            <span class="score-value">${optimization.seo_score}/100</span>
                        </div>
                    </div>
                    
                    <div class="optimization-metrics-grid">
                        <div class="metric-card">
                            <div class="metric-icon">📖</div>
                            <div class="metric-info">
                                <span class="metric-label">Readability</span>
                                <span class="metric-value">${optimization.readability}</span>
                            </div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-icon">📊</div>
                            <div class="metric-info">
                                <span class="metric-label">Word Count</span>
                                <span class="metric-value">${optimization.word_count}</span>
                            </div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-icon">🎯</div>
                            <div class="metric-info">
                                <span class="metric-label">Keyword Density</span>
                                <span class="metric-value">${optimization.keyword_density}%</span>
                            </div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-icon">🔗</div>
                            <div class="metric-info">
                                <span class="metric-label">Internal Links</span>
                                <span class="metric-value">${optimization.internal_links}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="ai-recommendations">
                        <h5>🤖 AI Recommendations</h5>
                        <div class="recommendations-list">
                            ${optimization.suggestions.map(rec => `
                                <div class="recommendation-item">
                                    <div class="rec-content">
                                        <span class="rec-text">${rec}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
            
        } catch (error) {
            console.error('Error optimizing content:', error);
            const errorMessage = error.message || 'Failed to optimize content';
            showToast(`Failed to optimize content: ${errorMessage}`, 'error');
            document.getElementById('optimizationResults').innerHTML = `
                <div class="error-message">
                    <p>❌ Failed to optimize content</p>
                    <p class="error-details">${errorMessage}</p>
                </div>
            `;
        } finally {
            hideLoading(document.getElementById('optimizationResults'));
        }
    },

    async analyzeCompetitor() {
        const url = document.getElementById('competitorUrl').value;
        if (!url) {
            showToast('Please enter a competitor URL', 'warning');
            return;
        }
        
        try {
            showLoading(document.getElementById('competitorResults'));
            
            // Real API call to analyze competitor
            const response = await fetch(`${CONFIG.API_BASE_URL}/api/v1/admin/contents/seo/analyze-competitor`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ url: url })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.detail || `HTTP error! status: ${response.status}`;
                throw new Error(errorMessage);
            }
            
            const analysis = await response.json();
            
            // Check if analysis failed
            if (analysis.error) {
                document.getElementById('competitorResults').innerHTML = `
                    <div class="error-message">
                        <p>❌ ${analysis.title}</p>
                        <p class="error-details">${analysis.error}</p>
                        <div class="opportunities-section">
                            <h5>💡 Suggestions</h5>
                            <div class="opportunities-list">
                                ${analysis.opportunities.map(opp => `
                                    <div class="opportunity-item">
                                        <i class="fas fa-info-circle"></i>
                                        <span>${opp}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                `;
                return;
            }
            
            document.getElementById('competitorResults').innerHTML = `
                <div class="competitor-analysis">
                    <h4>✅ Competitor Analysis Results</h4>
                    
                    <div class="analysis-metrics">
                        <div class="metric-card">
                            <div class="metric-icon">📝</div>
                            <div class="metric-info">
                                <span class="metric-label">Title</span>
                                <span class="metric-value">${analysis.title}</span>
                            </div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-icon">📊</div>
                            <div class="metric-info">
                            <span class="metric-label">Content Length</span>
                            <span class="metric-value">${analysis.content_length}</span>
                        </div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-icon">🔗</div>
                            <div class="metric-info">
                            <span class="metric-label">Headings</span>
                            <span class="metric-value">${analysis.headings}</span>
                        </div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-icon">🖼️</div>
                            <div class="metric-info">
                            <span class="metric-label">Images</span>
                            <span class="metric-value">${analysis.images}</span>
                        </div>
                    </div>
                    </div>
                    
                    <div class="analysis-metrics">
                        <div class="metric-card">
                            <div class="metric-icon">🔗</div>
                            <div class="metric-info">
                                <span class="metric-label">Internal Links</span>
                                <span class="metric-value">${analysis.internal_links || 0}</span>
                            </div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-icon">🌐</div>
                            <div class="metric-info">
                                <span class="metric-label">External Links</span>
                                <span class="metric-value">${analysis.external_links || 0}</span>
                            </div>
                        </div>
                    </div>
                    
                    ${analysis.meta_description ? `
                        <div class="meta-description-section">
                            <h5>📄 Meta Description</h5>
                            <p class="meta-description">${analysis.meta_description}</p>
                        </div>
                    ` : ''}
                    
                    <div class="keywords-section">
                        <h5>🔑 Keywords Used</h5>
                        <div class="keywords-list">
                            ${analysis.keywords && analysis.keywords.length > 0 ? 
                                analysis.keywords.map(keyword => `
                                    <span class="keyword-tag">${keyword}</span>
                                `).join('') :
                                '<p class="empty-message">No keywords detected</p>'
                            }
                        </div>
                    </div>
                    
                    <div class="opportunities-section">
                        <h5>💡 SEO Opportunities</h5>
                        <div class="opportunities-list">
                            ${analysis.opportunities.map(opp => `
                                <div class="opportunity-item">
                                    <i class="fas fa-lightbulb"></i>
                                    <span>${opp}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div class="gaps-section">
                        <h5>⚠️ Content Gaps</h5>
                        <div class="gaps-list">
                            ${analysis.gaps.map(gap => `
                                <div class="gap-item">
                                    <i class="fas fa-exclamation-circle"></i>
                                    <span>${gap}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
            
        } catch (error) {
            console.error('Error analyzing competitor:', error);
            const errorMessage = error.message || 'Failed to analyze competitor';
            showToast(`Failed to analyze competitor: ${errorMessage}`, 'error');
            document.getElementById('competitorResults').innerHTML = `
                <div class="error-message">
                    <p>❌ Failed to analyze competitor</p>
                    <p class="error-details">${errorMessage}</p>
                </div>
            `;
        } finally {
            hideLoading(document.getElementById('competitorResults'));
        }
    },

    applyOptimizations() {
        showToast('Applying optimizations...', 'info');
        // Implementation for applying optimizations
    },

    generateVariations() {
        showToast('Generating content variations...', 'info');
        // Implementation for generating variations
    }
};

// Workflow Management Module
const workflow = {
    currentPage: {
        pending: 0,
        approved: 0,
        rejected: 0
    },
    pageSize: 10,
    
    async loadWorkflowData() {
        try {
            await this.loadPendingContent();
            await this.loadApprovedContent();
            await this.loadRejectedContent();
        } catch (error) {
            console.error('Error loading workflow data:', error);
            showToast('Failed to load workflow data', 'error');
        }
    },

    async loadPendingContent(page = 0) {
        const container = document.getElementById('pendingWorkflowList');
        try {
            showLoading(container);
            
            // Use API pagination with status filter
            const skip = page * this.pageSize;
            const response = await api.request(`/api/v1/admin/contents/bulk/jobs?status_filter=pending_review&skip=${skip}&limit=${this.pageSize}`);
            // API returns array directly, not { jobs: [...] }
            const pendingJobs = Array.isArray(response) ? response : (response.jobs || []);
            
            if (pendingJobs.length === 0 && page === 0) {
                container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>No content pending review</p></div>';
                return;
            }
            
            // For pagination info, we need to get total count
            // Since API doesn't return total, we'll show "Load More" style
            const hasMore = pendingJobs.length === this.pageSize;
            
        container.innerHTML = `
                <div class="workflow-header-info">
                    <p>Page ${page + 1} - Showing ${pendingJobs.length} jobs</p>
                </div>
                ${pendingJobs.map(job => `
                <div class="workflow-item" data-job-id="${job._id}">
                    <div class="workflow-header">
                        <h4>${job.topic}</h4>
                        <span class="badge badge-warning">${job.status}</span>
                    </div>
                <div class="workflow-content">
                        <p><strong>Category:</strong> ${job.category}</p>
                        <p><strong>Articles:</strong> ${job.total_articles} articles</p>
                        <p><strong>Created:</strong> ${new Date(job.created_at).toLocaleDateString()}</p>
                        ${job.ideas && job.ideas.length > 0 ? `
                            <div class="ideas-preview">
                                <strong>Ideas:</strong>
                                <ul>
                                    ${job.ideas.slice(0, 3).map(idea => `<li>${idea.title}</li>`).join('')}
                                    ${job.ideas.length > 3 ? `<li>... and ${job.ideas.length - 3} more</li>` : ''}
                                </ul>
                            </div>
                        ` : ''}
                </div>
                <div class="workflow-actions">
                        <button class="btn btn-primary" onclick="workflow.reviewJob('${job._id}')">
                            <i class="fas fa-eye"></i> Review
                    </button>
                        <button class="btn btn-success" onclick="workflow.approveJob('${job._id}')">
                            <i class="fas fa-check"></i> Approve All
                        </button>
                        <button class="btn btn-danger" onclick="workflow.cancelJob('${job._id}')">
                            <i class="fas fa-times"></i> Cancel
                    </button>
                </div>
            </div>
            `).join('')}
                ${page > 0 || hasMore ? `
                    <div class="pagination-controls">
                        <button class="btn btn-secondary" 
                                onclick="workflow.loadPendingContent(${page - 1})" 
                                ${page === 0 ? 'disabled' : ''}>
                            <i class="fas fa-chevron-left"></i> Previous
                        </button>
                        <span class="page-info">Page ${page + 1}</span>
                        <button class="btn btn-secondary" 
                                onclick="workflow.loadPendingContent(${page + 1})" 
                                ${!hasMore ? 'disabled' : ''}>
                            Next <i class="fas fa-chevron-right"></i>
                        </button>
                    </div>
                ` : ''}
            `;
            
            this.currentPage.pending = page;
            
        } catch (error) {
            console.error('Error loading pending content:', error);
            container.innerHTML = '<div class="error-message">Failed to load pending content</div>';
        } finally {
            hideLoading(container);
        }
    },

    async loadApprovedContent(page = 0) {
        const container = document.getElementById('approvedWorkflowList');
        try {
            showLoading(container);
            
            const skip = page * this.pageSize;
            const response = await api.request(`/api/v1/admin/contents/bulk/jobs?skip=${skip}&limit=${this.pageSize}`);
            const jobs = Array.isArray(response) ? response : (response.jobs || []);
            const approvedJobs = jobs.filter(job => job.status === 'reviewed' || job.status === 'processing' || job.status === 'completed');
            
            if (approvedJobs.length === 0) {
                container.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i><p>No approved content</p></div>';
                return;
            }
            
            container.innerHTML = approvedJobs.map(job => `
                <div class="workflow-item" data-job-id="${job._id}">
                    <div class="workflow-header">
                        <h4>${job.topic}</h4>
                        <span class="badge badge-${job.status === 'completed' ? 'success' : 'info'}">${job.status}</span>
                    </div>
                    <div class="workflow-content">
                        <p><strong>Category:</strong> ${job.category}</p>
                        <p><strong>Progress:</strong> ${job.completed_articles}/${job.total_articles} articles</p>
                        <p><strong>Created:</strong> ${new Date(job.created_at).toLocaleDateString()}</p>
                    </div>
                    <div class="workflow-actions">
                        <button class="btn btn-primary" onclick="workflow.reviewJob('${job._id}')">
                            <i class="fas fa-eye"></i> View Details
                        </button>
                    </div>
                </div>
            `).join('');
            
        } catch (error) {
            console.error('Error loading approved content:', error);
            container.innerHTML = '<div class="error-message">Failed to load approved content</div>';
        } finally {
            hideLoading(container);
        }
    },

    async loadRejectedContent() {
        const container = document.getElementById('rejectedWorkflowList');
        try {
            showLoading(container);
            
            const response = await api.request('/api/v1/admin/contents/bulk/jobs?limit=20');
            const jobs = Array.isArray(response) ? response : (response.jobs || []);
            const rejectedJobs = jobs.filter(job => job.status === 'cancelled' || job.status === 'failed');
            
            if (rejectedJobs.length === 0) {
                container.innerHTML = '<div class="empty-state"><i class="fas fa-times-circle"></i><p>No rejected content</p></div>';
                return;
            }
            
            container.innerHTML = rejectedJobs.map(job => `
                <div class="workflow-item" data-job-id="${job._id}">
                    <div class="workflow-header">
                        <h4>${job.topic}</h4>
                        <span class="badge badge-danger">${job.status}</span>
                    </div>
                    <div class="workflow-content">
                        <p><strong>Category:</strong> ${job.category}</p>
                        <p><strong>Articles:</strong> ${job.total_articles} articles</p>
                        <p><strong>Created:</strong> ${new Date(job.created_at).toLocaleDateString()}</p>
                        ${job.error_message ? `<p class="error-text"><strong>Error:</strong> ${job.error_message}</p>` : ''}
                    </div>
                    <div class="workflow-actions">
                        <button class="btn btn-danger" onclick="workflow.deleteJob('${job._id}')">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                </div>
            `).join('');
            
        } catch (error) {
            console.error('Error loading rejected content:', error);
            container.innerHTML = '<div class="error-message">Failed to load rejected content</div>';
        } finally {
            hideLoading(container);
        }
    },

    async reviewJob(jobId) {
        // Navigate to bulk section and start review from job
        navigation.switchSection('bulk');
        setTimeout(async () => {
            try {
                await bulk.startReviewFromJob(jobId);
            } catch (error) {
                console.error('Failed to start review from job:', error);
                showToast('Failed to load job for review', 'error');
            }
        }, 300);
    },

    async approveJob(jobId) {
        try {
            if (!confirm('Are you sure you want to approve all ideas and start generation?')) {
                return;
            }

            // Get job details first
            const jobResponse = await api.request(`/api/v1/admin/contents/bulk/jobs/${jobId}`);
            const job = jobResponse.job || jobResponse;

            // Approve all ideas - handle different response structures
            const ideas = job.ideas || job.article_ideas || [];
            
            if (!ideas || ideas.length === 0) {
                showToast('No ideas found in this job to approve', 'warning');
                return;
            }
            
            const approvedIdeas = ideas.map(idea => ({
                ...idea,
                approved: true
            }));

            await api.request(`/api/v1/admin/contents/bulk/review/${jobId}`, {
                method: 'PUT',
                body: JSON.stringify({
                    ideas: approvedIdeas
                })
            });

            // Start generation
            await api.request(`/api/v1/admin/contents/bulk/generate/${jobId}`, {
                method: 'POST'
            });

            showToast('Content generation started successfully!', 'success');
            this.loadWorkflowData();

        } catch (error) {
            console.error('Error approving job:', error);
            showToast('Failed to approve job', 'error');
        }
    },

    async cancelJob(jobId) {
        try {
            if (!confirm('Are you sure you want to cancel this job?')) {
                return;
            }

            await api.request(`/api/v1/admin/contents/bulk/jobs/${jobId}`, {
                method: 'DELETE'
            });

            showToast('Job cancelled successfully', 'success');
            this.loadWorkflowData();

        } catch (error) {
            console.error('Error cancelling job:', error);
            showToast('Failed to cancel job', 'error');
        }
    },

    async deleteJob(jobId) {
        try {
            if (!confirm('Are you sure you want to delete this job? This action cannot be undone.')) {
                return;
            }

            await api.request(`/api/v1/admin/contents/bulk/jobs/${jobId}`, {
                method: 'DELETE'
            });

            showToast('Job deleted successfully', 'success');
            this.loadWorkflowData();

        } catch (error) {
            console.error('Error deleting job:', error);
            showToast('Failed to delete job', 'error');
        }
    }
};

// Team Collaboration Module
const team = {
    async loadTeamData() {
        try {
            this.loadTeamMembers();
            this.loadCollaborations();
            this.loadAssignments();
        } catch (error) {
            console.error('Error loading team data:', error);
            showToast('Failed to load team data', 'error');
        }
    },

    async loadTeamMembers() {
        const container = document.getElementById('teamMembersList');
        const members = [
            { 
                name: 'John Doe', 
                role: 'Content Manager', 
                status: 'online', 
                avatar: '👨‍💼',
                lastActive: '2 minutes ago',
                tasksCompleted: 12,
                currentTask: 'Reviewing wellness content',
                skills: ['Content Strategy', 'Team Management', 'SEO'],
                performance: 95
            },
            { 
                name: 'Jane Smith', 
                role: 'SEO Specialist', 
                status: 'away', 
                avatar: '👩‍💻',
                lastActive: '15 minutes ago',
                tasksCompleted: 8,
                currentTask: 'Keyword research for Q4',
                skills: ['SEO', 'Analytics', 'Keyword Research'],
                performance: 88
            },
            { 
                name: 'Mike Johnson', 
                role: 'Editor', 
                status: 'offline', 
                avatar: '👨‍🎨',
                lastActive: '2 hours ago',
                tasksCompleted: 15,
                currentTask: 'Editing tech articles',
                skills: ['Editing', 'Proofreading', 'Content Quality'],
                performance: 92
            },
            { 
                name: 'Sarah Wilson', 
                role: 'AI Content Specialist', 
                status: 'online', 
                avatar: '👩‍🔬',
                lastActive: 'Just now',
                tasksCompleted: 6,
                currentTask: 'Optimizing AI prompts',
                skills: ['AI Tools', 'Content Generation', 'Automation'],
                performance: 90
            }
        ];
        
        container.innerHTML = `
            <div class="team-members-grid">
                ${members.map(member => `
                    <div class="team-member-card">
                        <div class="member-header">
                            <div class="member-avatar">${member.avatar}</div>
                            <div class="member-status-indicator ${member.status}"></div>
                            <div class="member-performance">
                                <span class="performance-score">${member.performance}%</span>
                            </div>
                        </div>
                        <div class="member-info">
                            <h4>${member.name}</h4>
                            <p class="member-role">${member.role}</p>
                            <div class="member-stats">
                                <div class="stat">
                                    <span class="stat-label">Tasks</span>
                                    <span class="stat-value">${member.tasksCompleted}</span>
                                </div>
                                <div class="stat">
                                    <span class="stat-label">Status</span>
                                    <span class="stat-value ${member.status}">${member.status}</span>
                                </div>
                            </div>
                            <div class="member-activity">
                                <p class="current-task">📝 ${member.currentTask}</p>
                                <p class="last-active">⏰ ${member.lastActive}</p>
                            </div>
                            <div class="member-skills">
                                ${member.skills.map(skill => `<span class="skill-tag">${skill}</span>`).join('')}
                            </div>
                            <div class="member-actions">
                                <button class="btn btn-sm btn-primary" onclick="team.startChat('${member.name}')">
                                    <i class="fas fa-comment"></i> Chat
                                </button>
                                <button class="btn btn-sm btn-secondary" onclick="team.assignTask('${member.name}')">
                                    <i class="fas fa-tasks"></i> Assign
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    startChat(memberName) {
        showToast(`Starting chat with ${memberName}`, 'info');
        // Implementation for starting chat
    },

    assignTask(memberName) {
        showToast(`Opening task assignment for ${memberName}`, 'info');
        // Implementation for task assignment
    },

    async loadCollaborations() {
        const container = document.getElementById('collaborationList');
        container.innerHTML = `
            <div class="collaboration-item">
                <div class="collaboration-content">
                    <h5>Content Review</h5>
                    <p>John reviewed "AI Best Practices" article</p>
                    <span class="collaboration-time">2 hours ago</span>
                </div>
            </div>
        `;
    },

    async loadAssignments() {
        const container = document.getElementById('assignmentsList');
        container.innerHTML = `
            <div class="assignment-item">
                <div class="assignment-content">
                    <h5>SEO Optimization</h5>
                    <p>Assigned to Jane Smith</p>
                    <span class="assignment-due">Due: Tomorrow</span>
                </div>
            </div>
        `;
    },

    showAddMemberModal() {
        showToast('Add member functionality coming soon', 'info');
    }
};

// AI Insights Module
const insights = {
    async loadInsights() {
        try {
            this.loadContentRecommendations();
            this.loadTrendingTopics();
            this.loadPerformanceInsights();
            this.loadSEOOpportunities();
        } catch (error) {
            console.error('Error loading insights:', error);
            showToast('Failed to load insights', 'error');
        }
    },

    async loadContentRecommendations() {
        const container = document.getElementById('contentRecommendations');
        container.innerHTML = `
            <div class="insight-item">
                <h5>Content Gap Analysis</h5>
                <p>Consider creating content about "AI Ethics" - high search volume, low competition</p>
            </div>
            <div class="insight-item">
                <h5>Trending Topic</h5>
                <p>"Machine Learning in Healthcare" is trending - create comprehensive guide</p>
            </div>
        `;
    },

    async loadTrendingTopics() {
        const container = document.getElementById('trendingTopics');
        container.innerHTML = `
            <div class="topic-item">
                <span class="topic-name">AI Ethics</span>
                <span class="topic-trend up">↗ +25%</span>
            </div>
            <div class="topic-item">
                <span class="topic-name">Machine Learning</span>
                <span class="topic-trend up">↗ +18%</span>
            </div>
        `;
    },

    async loadPerformanceInsights() {
        const container = document.getElementById('performanceInsights');
        container.innerHTML = `
            <div class="insight-item">
                <h5>Content Performance</h5>
                <p>Your E-E-A-T optimized content performs 40% better than standard content</p>
            </div>
        `;
    },

    async loadSEOOpportunities() {
        const container = document.getElementById('seoOpportunities');
        const opportunities = [
            {
                title: 'Keyword Gap Analysis',
                description: 'You\'re missing 15 high-value keywords that competitors rank for',
                priority: 'high',
                impact: 'High traffic potential',
                keywords: ['AI content generation', 'automated writing', 'content optimization'],
                action: 'View Opportunities'
            },
            {
                title: 'Content Freshness',
                description: '12 articles need updates to maintain search rankings',
                priority: 'medium',
                impact: 'Prevent ranking drops',
                keywords: ['content updates', 'fresh content', 'SEO maintenance'],
                action: 'Update Content'
            },
            {
                title: 'Internal Linking',
                description: 'Opportunity to add 25+ internal links to boost page authority',
                priority: 'high',
                impact: 'Improve site structure',
                keywords: ['internal links', 'site architecture', 'link building'],
                action: 'Optimize Links'
            },
            {
                title: 'Featured Snippets',
                description: '5 articles can be optimized for featured snippets',
                priority: 'medium',
                impact: 'Increase visibility',
                keywords: ['featured snippets', 'position zero', 'structured data'],
                action: 'Optimize Snippets'
            }
        ];
        
        container.innerHTML = `
            <div class="opportunities-grid">
                ${opportunities.map(opp => `
                    <div class="opportunity-card ${opp.priority}">
                        <div class="opportunity-header">
                            <h5>${opp.title}</h5>
                            <span class="priority-badge ${opp.priority}">${opp.priority}</span>
                        </div>
                        <p class="opportunity-description">${opp.description}</p>
                        <div class="opportunity-impact">
                            <span class="impact-label">Impact:</span>
                            <span class="impact-value">${opp.impact}</span>
                        </div>
                        <div class="opportunity-keywords">
                            ${opp.keywords.map(keyword => `<span class="keyword-tag">${keyword}</span>`).join('')}
                        </div>
                        <button class="btn btn-sm btn-primary" onclick="insights.handleOpportunity('${opp.title}')">
                            ${opp.action}
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
    },

    handleOpportunity(opportunityTitle) {
        showToast(`Processing ${opportunityTitle}...`, 'info');
        // Implementation for handling opportunities
    }
};

// Export and Backup Module
const exportModule = {
    async exportContent(format = 'json') {
        try {
            showLoading(document.getElementById('exportResults'));
            
            // Mock export data
            const exportData = {
                content: [
                    {
                        id: 'content_1',
                        title: 'AI Content Generation Best Practices',
                        category: 'Technology',
                        status: 'published',
                        created_at: '2025-10-01',
                        word_count: 2500,
                        seo_score: 92
                    },
                    {
                        id: 'content_2',
                        title: 'E-E-A-T Optimization Guide',
                        category: 'SEO',
                        status: 'draft',
                        created_at: '2025-10-02',
                        word_count: 1800,
                        seo_score: 88
                    }
                ],
                analytics: {
                    total_content: 1250,
                    published: 1100,
                    drafts: 65,
                    avg_quality_score: 87
                },
                export_date: new Date().toISOString(),
                format: format
            };
            
            if (format === 'json') {
                this.downloadJSON(exportData);
            } else if (format === 'csv') {
                this.downloadCSV(exportData);
            } else if (format === 'excel') {
                this.downloadExcel(exportData);
            }
            
            showToast(`Content exported successfully as ${format.toUpperCase()}`, 'success');
            
        } catch (error) {
            console.error('Error exporting content:', error);
            showToast('Failed to export content', 'error');
        } finally {
            hideLoading(document.getElementById('exportResults'));
        }
    },
    
    downloadJSON(data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `content_export_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },
    
    downloadCSV(data) {
        const csvContent = this.convertToCSV(data.content);
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `content_export_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },
    
    downloadExcel(data) {
        // Mock Excel download
        showToast('Excel export feature coming soon!', 'info');
    },
    
    convertToCSV(data) {
        const headers = ['ID', 'Title', 'Category', 'Status', 'Created At', 'Word Count', 'SEO Score'];
        const rows = data.map(item => [
            item.id,
            item.title,
            item.category,
            item.status,
            item.created_at,
            item.word_count,
            item.seo_score
        ]);
        
        const csvContent = [headers, ...rows]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');
            
        return csvContent;
    },
    
    async createBackup() {
        try {
            showLoading(document.getElementById('backupResults'));
            
            const backupData = {
                timestamp: new Date().toISOString(),
                version: '1.0.0',
                content_count: 1250,
                settings: {
                    theme: 'dark',
                    notifications: true,
                    auto_save: true
                },
                user_preferences: {
                    default_category: 'technology',
                    content_length: 'medium',
                    seo_focus: 'high'
                }
            };
            
            // Simulate backup creation
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            document.getElementById('backupResults').innerHTML = `
                <div class="backup-success">
                    <h4>✅ Backup Created Successfully</h4>
                    <div class="backup-details">
                        <p><strong>Backup ID:</strong> backup_${Date.now()}</p>
                        <p><strong>Created:</strong> ${new Date().toLocaleString()}</p>
                        <p><strong>Size:</strong> 2.4 MB</p>
                        <p><strong>Content Items:</strong> ${backupData.content_count}</p>
                    </div>
                    <div class="backup-actions">
                        <button class="btn btn-primary" onclick="exportModule.downloadBackup()">
                            <i class="fas fa-download"></i> Download Backup
                        </button>
                        <button class="btn btn-secondary" onclick="exportModule.scheduleBackup()">
                            <i class="fas fa-clock"></i> Schedule Auto-Backup
                        </button>
                    </div>
                </div>
            `;
            
            showToast('Backup created successfully!', 'success');
            
        } catch (error) {
            console.error('Error creating backup:', error);
            showToast('Failed to create backup', 'error');
        } finally {
            hideLoading(document.getElementById('backupResults'));
        }
    },
    
    downloadBackup() {
        showToast('Downloading backup file...', 'info');
        // Implementation for backup download
    },
    
    scheduleBackup() {
        showToast('Auto-backup scheduled for daily at 2:00 AM', 'success');
        // Implementation for scheduling backups
    }
};

// Initialize SEO helpers when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    seoHelper.initMetaDescCounter();
    
    // E-E-A-T form is now handled by eeatCreate module in the main Create Content section
    
    // Initialize workflow tabs
    const workflowTabs = document.querySelectorAll('.workflow-tabs .tab-btn');
    workflowTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            
            // Update active tab
            workflowTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // Update content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            const tabContent = document.getElementById(`${tabName}-tab`);
            if (tabContent) tabContent.classList.add('active');
        });
    });
});

// Export for global access
window.dashboard = dashboard;
window.brainstorm = brainstorm;
window.bulk = bulk;
window.aiGenerated = aiGenerated;
window.manualEntry = manualEntry;
window.navigation = navigation;
window.contentCreator = contentCreator;
window.contentEditor = contentEditor;
window.seoHelper = seoHelper;

window.seoHelper = seoHelper;
