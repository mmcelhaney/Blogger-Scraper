import React, { useState, useRef } from 'react';
import { Download, RefreshCw, X, Play, Check } from 'lucide-react';

const BloggerScraper = () => {
  const [blogUrl, setBlogUrl] = useState('');
  const [rssUrl, setRssUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [yearStats, setYearStats] = useState([]);
  const [error, setError] = useState('');
  const abortControllerRef = useRef(null);

  const extractBlogId = (url) => {
    try {
      const cleanUrl = url.trim();
      let blogId = '';
      
      if (cleanUrl.includes('.blogspot.com')) {
        blogId = cleanUrl.split('.blogspot.com')[0].split('//').pop();
      } else {
        throw new Error('Invalid Blogger URL');
      }
      
      return blogId;
    } catch (err) {
      throw new Error('Please enter a valid Blogger URL (e.g., https://yourblog.blogspot.com)');
    }
  };

  const parseRssUrl = () => {
    setError('');
    setRssUrl('');
    
    try {
      const blogId = extractBlogId(blogUrl);
      const generatedRssUrl = `https://${blogId}.blogspot.com/feeds/posts/default`;
      setRssUrl(generatedRssUrl);
    } catch (err) {
      setError(err.message);
    }
  };

  const fetchAllPosts = async (baseRssUrl, signal) => {
    const allPosts = [];
    let startIndex = 1;
    const maxResults = 500;
    let hasMore = true;

    while (hasMore && !signal.aborted) {
      const url = `${baseRssUrl}?start-index=${startIndex}&max-results=${maxResults}&alt=json`;
      
      try {
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        const entries = data.feed.entry || [];
        
        if (entries.length === 0) {
          hasMore = false;
        } else {
          allPosts.push(...entries);
          startIndex += maxResults;
          
          const estimatedTotal = parseInt(data.feed.openSearch$totalResults.$t) || allPosts.length;
          setProgress(Math.min((allPosts.length / estimatedTotal) * 100, 99));
          setStatusMessage(`Fetched ${allPosts.length} posts...`);
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          throw err;
        }
        hasMore = false;
      }
    }

    return allPosts;
  };

  const groupPostsByYear = (posts) => {
    const postsByYear = {};

    posts.forEach(post => {
      const publishedDate = post.published.$t;
      const year = new Date(publishedDate).getFullYear();
      
      if (!postsByYear[year]) {
        postsByYear[year] = [];
      }
      postsByYear[year].push(post);
    });

    return postsByYear;
  };

  const createXmlForYear = (year, posts) => {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += `<blog year="${year}">\n`;
    
    posts.forEach(post => {
      xml += '  <post>\n';
      xml += `    <title><![CDATA[${post.title.$t}]]></title>\n`;
      xml += `    <published>${post.published.$t}</published>\n`;
      xml += `    <updated>${post.updated.$t}</updated>\n`;
      
      if (post.author && post.author[0]) {
        xml += `    <author><![CDATA[${post.author[0].name.$t}]]></author>\n`;
      }
      
      if (post.content) {
        xml += `    <content><![CDATA[${post.content.$t}]]></content>\n`;
      }
      
      if (post.category) {
        xml += '    <categories>\n';
        post.category.forEach(cat => {
          xml += `      <category><![CDATA[${cat.term}]]></category>\n`;
        });
        xml += '    </categories>\n';
      }
      
      if (post.link) {
        const postLink = post.link.find(l => l.rel === 'alternate');
        if (postLink) {
          xml += `    <url>${postLink.href}</url>\n`;
        }
      }
      
      xml += '  </post>\n';
    });
    
    xml += '</blog>';
    return xml;
  };

  const downloadXml = (filename, content) => {
    const blob = new Blob([content], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const runScraper = async () => {
    if (!rssUrl) {
      setError('Please generate RSS URL first');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setStatusMessage('Starting scrape...');
    setError('');
    setYearStats([]);
    
    abortControllerRef.current = new AbortController();

    try {
      setStatusMessage('Fetching all posts...');
      const allPosts = await fetchAllPosts(rssUrl, abortControllerRef.current.signal);
      
      if (allPosts.length === 0) {
        setError('No posts found in the blog');
        setIsProcessing(false);
        return;
      }

      setStatusMessage('Organizing posts by year...');
      setProgress(95);
      
      const postsByYear = groupPostsByYear(allPosts);
      const stats = [];

      setStatusMessage('Generating XML files...');
      
      for (const [year, posts] of Object.entries(postsByYear)) {
        const xml = createXmlForYear(year, posts);
        const blogId = extractBlogId(blogUrl);
        downloadXml(`${blogId}_${year}.xml`, xml);
        stats.push({ year: parseInt(year), count: posts.length });
      }

      stats.sort((a, b) => b.year - a.year);
      setYearStats(stats);
      
      setProgress(100);
      setStatusMessage(`Complete! Downloaded ${stats.length} XML files with ${allPosts.length} total posts.`);
      setIsProcessing(false);
      
    } catch (err) {
      if (err.name === 'AbortError') {
        setStatusMessage('Scraping cancelled by user');
      } else {
        setError(`Error: ${err.message}`);
      }
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const resetForm = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setBlogUrl('');
    setRssUrl('');
    setIsProcessing(false);
    setProgress(0);
    setStatusMessage('');
    setYearStats([]);
    setError('');
  };

  const quitApp = () => {
    if (confirm('Are you sure you want to quit?')) {
      resetForm();
      window.close();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-xl p-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-6 text-center">
          Blogger RSS Feed Scraper
        </h1>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Blogger URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={blogUrl}
                onChange={(e) => setBlogUrl(e.target.value)}
                placeholder="https://yourblog.blogspot.com"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isProcessing}
              />
              <button
                onClick={parseRssUrl}
                disabled={isProcessing || !blogUrl}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                Parse
              </button>
            </div>
          </div>

          {rssUrl && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <label className="block text-sm font-medium text-green-800 mb-1">
                RSS Feed URL
              </label>
              <p className="text-green-700 break-all text-sm font-mono">{rssUrl}</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {isProcessing && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>{statusMessage}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-blue-600 h-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {yearStats.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h2 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                <Check className="w-5 h-5" />
                Posts by Year
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {yearStats.map(stat => (
                  <div key={stat.year} className="bg-white rounded px-3 py-2 text-sm">
                    <span className="font-semibold text-gray-700">{stat.year}:</span>
                    <span className="text-gray-600 ml-2">{stat.count} posts</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              onClick={runScraper}
              disabled={isProcessing || !rssUrl}
              className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 font-medium"
            >
              <Play className="w-5 h-5" />
              Run Scraper
            </button>

            <button
              onClick={resetForm}
              disabled={isProcessing}
              className="px-6 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 font-medium"
            >
              <RefreshCw className="w-5 h-5" />
              Reset
            </button>

            <button
              onClick={quitApp}
              className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2 font-medium"
            >
              <X className="w-5 h-5" />
              Quit
            </button>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200 text-center text-sm text-gray-500">
          <p>This tool fetches all posts from your Blogger blog via RSS feed and organizes them into XML files by year.</p>
        </div>
      </div>
    </div>
  );
};

export default BloggerScraper;