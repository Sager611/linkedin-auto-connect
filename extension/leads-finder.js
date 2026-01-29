// LinkedIn Lead Finder - Native LinkedIn Search
// Two-step flow: Search companies -> Select companies -> Search people at those companies

// ============================================================================
// STATE
// ============================================================================

const state = {
  // Step 1: Company search
  selectedIndustries: new Set(),
  selectedLocations: new Set(),
  selectedSizes: new Set(),
  companyKeywords: '',
  companyResults: [],
  selectedCompanies: new Map(), // Map<companyId, companyData>
  companyCurrentPage: 1,
  companyHasMore: false,
  
  // Step 2: People search
  peopleKeywords: '',
  peopleResults: [],
  selectedPeople: new Set(), // Set of result indices
  peopleCurrentPage: 1,
  peopleHasMore: false,
  
  // UI state
  currentStep: 1,
  isLoading: false
};

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const elements = {
  // Step indicators
  step1Indicator: document.getElementById('step1-indicator'),
  step2Indicator: document.getElementById('step2-indicator'),
  
  // Containers
  step1Container: document.getElementById('step1-container'),
  step2Container: document.getElementById('step2-container'),
  
  // Step 1 elements
  industryCheckboxes: document.getElementById('industry-checkboxes'),
  locationCheckboxes: document.getElementById('location-checkboxes'),
  sizeCheckboxes: document.getElementById('size-checkboxes'),
  companyKeywords: document.getElementById('company-keywords'),
  maxPages: document.getElementById('max-pages'),
  searchCompaniesBtn: document.getElementById('search-companies-btn'),
  companyResultsCard: document.getElementById('company-results-card'),
  companyResultsContainer: document.getElementById('company-results-container'),
  companyResultsCount: document.getElementById('company-results-count'),
  loadMoreCompaniesBtn: document.getElementById('load-more-companies-btn'),
  proceedToStep2Btn: document.getElementById('proceed-to-step2-btn'),
  
  // Step 2 elements
  selectedCompaniesSummary: document.getElementById('selected-companies-summary'),
  selectedCount: document.getElementById('selected-count'),
  selectedCompaniesList: document.getElementById('selected-companies-list'),
  backToStep1Btn: document.getElementById('back-to-step1-btn'),
  peopleKeywords: document.getElementById('people-keywords'),
  peopleMaxPages: document.getElementById('people-max-pages'),
  searchPeopleBtn: document.getElementById('search-people-btn'),
  peopleResultsCard: document.getElementById('people-results-card'),
  peopleResultsContainer: document.getElementById('people-results-container'),
  peopleResultsCount: document.getElementById('people-results-count'),
  loadMorePeopleBtn: document.getElementById('load-more-people-btn'),
  addToQueueBtn: document.getElementById('add-to-queue-btn'),
  
  // Status
  statusContainer: document.getElementById('status-container')
};

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  initializeCheckboxes();
  setupEventListeners();
  await loadSavedState();
  updateUI();
});

function initializeCheckboxes() {
  // Populate industry checkboxes
  for (const [id, name] of Object.entries(LINKEDIN_IDS.industries)) {
    const item = createCheckboxItem('industry', id, name);
    elements.industryCheckboxes.appendChild(item);
  }
  
  // Populate location checkboxes
  for (const [id, name] of Object.entries(LINKEDIN_IDS.locations)) {
    const item = createCheckboxItem('location', id, name);
    elements.locationCheckboxes.appendChild(item);
  }
  
  // Populate size checkboxes
  for (const [code, label] of Object.entries(LINKEDIN_IDS.companySizes)) {
    const item = createCheckboxItem('size', code, label);
    elements.sizeCheckboxes.appendChild(item);
  }
}

function createCheckboxItem(type, value, label) {
  const div = document.createElement('div');
  div.className = 'checkbox-item';
  div.dataset.type = type;
  div.dataset.value = value;
  
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = `${type}-${value}`;
  checkbox.value = value;
  
  const labelEl = document.createElement('label');
  // Don't use htmlFor - we handle clicks on the container instead
  labelEl.textContent = label;
  
  div.appendChild(checkbox);
  div.appendChild(labelEl);
  
  // Toggle on click anywhere in the item
  div.addEventListener('click', (e) => {
    // Prevent double-toggle if clicking directly on checkbox
    if (e.target === checkbox) {
      div.classList.toggle('selected', checkbox.checked);
      handleCheckboxChange(type, value, checkbox.checked);
      return;
    }
    // For clicks elsewhere, toggle the checkbox
    checkbox.checked = !checkbox.checked;
    div.classList.toggle('selected', checkbox.checked);
    handleCheckboxChange(type, value, checkbox.checked);
  });
  
  return div;
}

function handleCheckboxChange(type, value, checked) {
  const setMap = {
    'industry': state.selectedIndustries,
    'location': state.selectedLocations,
    'size': state.selectedSizes
  };
  
  const set = setMap[type];
  if (checked) {
    set.add(value);
  } else {
    set.delete(value);
  }
  
  saveState();
}

function setupEventListeners() {
  // Back to popup
  document.getElementById('back-to-popup').addEventListener('click', (e) => {
    e.preventDefault();
    window.close();
  });
  
  // Step 1: Company search
  elements.searchCompaniesBtn.addEventListener('click', () => searchCompanies(true));
  elements.loadMoreCompaniesBtn.addEventListener('click', () => searchCompanies(false));
  elements.proceedToStep2Btn.addEventListener('click', proceedToStep2);
  
  // Step 2: People search
  elements.backToStep1Btn.addEventListener('click', backToStep1);
  elements.searchPeopleBtn.addEventListener('click', () => searchPeople(true));
  elements.loadMorePeopleBtn.addEventListener('click', () => searchPeople(false));
  elements.addToQueueBtn.addEventListener('click', addSelectedToQueue);
  
  // Input changes
  elements.companyKeywords.addEventListener('input', () => {
    state.companyKeywords = elements.companyKeywords.value;
    saveState();
  });
  
  elements.peopleKeywords.addEventListener('input', () => {
    state.peopleKeywords = elements.peopleKeywords.value;
    saveState();
  });
  
  // Enter key to search
  elements.companyKeywords.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchCompanies(true);
  });
  elements.peopleKeywords.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchPeople(true);
  });
}

// ============================================================================
// STATE PERSISTENCE
// ============================================================================

async function saveState() {
  const data = {
    selectedIndustries: Array.from(state.selectedIndustries),
    selectedLocations: Array.from(state.selectedLocations),
    selectedSizes: Array.from(state.selectedSizes),
    companyKeywords: state.companyKeywords,
    companyResults: state.companyResults,
    selectedCompanies: Array.from(state.selectedCompanies.entries()),
    peopleKeywords: state.peopleKeywords,
    peopleResults: state.peopleResults,
    currentStep: state.currentStep
  };
  await chrome.storage.local.set({ leadFinderState: data });
}

async function loadSavedState() {
  const { leadFinderState } = await chrome.storage.local.get('leadFinderState');
  if (!leadFinderState) return;
  
  // Restore selections
  state.selectedIndustries = new Set(leadFinderState.selectedIndustries || []);
  state.selectedLocations = new Set(leadFinderState.selectedLocations || []);
  state.selectedSizes = new Set(leadFinderState.selectedSizes || []);
  state.companyKeywords = leadFinderState.companyKeywords || '';
  state.companyResults = leadFinderState.companyResults || [];
  state.selectedCompanies = new Map(leadFinderState.selectedCompanies || []);
  state.peopleKeywords = leadFinderState.peopleKeywords || '';
  state.peopleResults = leadFinderState.peopleResults || [];
  state.currentStep = leadFinderState.currentStep || 1;
  
  // Restore UI state
  elements.companyKeywords.value = state.companyKeywords;
  elements.peopleKeywords.value = state.peopleKeywords;
  
  // Restore checkbox states
  state.selectedIndustries.forEach(id => {
    const item = document.querySelector(`[data-type="industry"][data-value="${id}"]`);
    if (item) {
      item.classList.add('selected');
      item.querySelector('input').checked = true;
    }
  });
  
  state.selectedLocations.forEach(id => {
    const item = document.querySelector(`[data-type="location"][data-value="${id}"]`);
    if (item) {
      item.classList.add('selected');
      item.querySelector('input').checked = true;
    }
  });
  
  state.selectedSizes.forEach(code => {
    const item = document.querySelector(`[data-type="size"][data-value="${code}"]`);
    if (item) {
      item.classList.add('selected');
      item.querySelector('input').checked = true;
    }
  });
  
  // Show results if we have them
  if (state.companyResults.length > 0) {
    elements.companyResultsCard.classList.remove('hidden');
    renderCompanyResults();
  }
  
  if (state.peopleResults.length > 0) {
    elements.peopleResultsCard.classList.remove('hidden');
    await renderPeopleResults();
  }
}

// ============================================================================
// URL BUILDING
// ============================================================================

function buildCompanySearchUrl(page = 1) {
  const params = new URLSearchParams();
  
  // Add industries
  if (state.selectedIndustries.size > 0) {
    const industries = JSON.stringify(Array.from(state.selectedIndustries));
    params.set('industryCompanyVertical', industries);
  }
  
  // Add locations
  if (state.selectedLocations.size > 0) {
    const locations = JSON.stringify(Array.from(state.selectedLocations));
    params.set('companyHqGeo', locations);
  }
  
  // Add company sizes
  if (state.selectedSizes.size > 0) {
    const sizes = JSON.stringify(Array.from(state.selectedSizes));
    params.set('companySize', sizes);
  }
  
  // Add keywords
  const keywords = elements.companyKeywords.value.trim();
  if (keywords) {
    params.set('keywords', keywords);
  }
  
  params.set('origin', 'FACETED_SEARCH');
  params.set('page', page.toString());
  
  return `https://www.linkedin.com/search/results/companies/?${params.toString()}`;
}

function buildPeopleSearchUrl(page = 1) {
  const params = new URLSearchParams();
  
  // Add selected company IDs
  if (state.selectedCompanies.size > 0) {
    const companyIds = JSON.stringify(Array.from(state.selectedCompanies.keys()));
    params.set('currentCompany', companyIds);
  }
  
  // Add keywords (role title)
  const keywords = elements.peopleKeywords.value.trim();
  if (keywords) {
    params.set('keywords', keywords);
  }
  
  params.set('origin', 'FACETED_SEARCH');
  params.set('page', page.toString());
  
  return `https://www.linkedin.com/search/results/people/?${params.toString()}`;
}

// ============================================================================
// SEARCH FUNCTIONS
// ============================================================================

async function searchCompanies(isNewSearch = true) {
  if (state.isLoading) return;
  
  // Validate at least one filter is selected
  if (state.selectedIndustries.size === 0 && 
      state.selectedLocations.size === 0 && 
      state.selectedSizes.size === 0 &&
      !elements.companyKeywords.value.trim()) {
    showStatus('Please select at least one filter or enter keywords', 'error');
    return;
  }
  
  state.isLoading = true;
  
  if (isNewSearch) {
    state.companyResults = [];
    state.companyCurrentPage = 1;
  }
  
  const maxPages = parseInt(elements.maxPages.value) || 5;
  const startPage = state.companyCurrentPage;
  const endPage = Math.min(startPage + maxPages - 1, 100);
  
  // Update UI
  elements.searchCompaniesBtn.disabled = true;
  elements.searchCompaniesBtn.textContent = 'Searching...';
  elements.loadMoreCompaniesBtn.disabled = true;
  elements.companyResultsCard.classList.remove('hidden');
  
  if (isNewSearch) {
    elements.companyResultsContainer.innerHTML = `
      <div class="loading">
        <div class="loading-spinner"></div>
        <div>Searching LinkedIn for companies...</div>
        <div class="loading-progress" id="company-loading-progress">Page 1 of ${maxPages}</div>
      </div>
    `;
  }
  
  clearStatus();
  
  try {
    let totalFound = 0;
    
    for (let page = startPage; page <= endPage; page++) {
      // Update progress
      const progressEl = document.getElementById('company-loading-progress');
      if (progressEl) {
        progressEl.textContent = `Page ${page - startPage + 1} of ${endPage - startPage + 1}`;
      }
      
      const url = buildCompanySearchUrl(page);
      console.log('Searching companies:', url);
      
      const result = await chrome.runtime.sendMessage({
        action: 'scrapeLinkedInSearch',
        url: url,
        type: 'companies'
      });
      
      if (result.error) {
        showStatus(result.error, 'error');
        break;
      }
      
      if (result.results && result.results.length > 0) {
        // Deduplicate by company ID
        const existingIds = new Set(state.companyResults.map(c => c.id));
        const newResults = result.results.filter(c => !existingIds.has(c.id));
        state.companyResults.push(...newResults);
        totalFound += newResults.length;
      } else {
        // No results on this page - we've reached the end
        console.log('No results on page', page, '- stopping');
        state.companyHasMore = false;
        break;
      }
      
      state.companyCurrentPage = page + 1;
      state.companyHasMore = result.hasNextPage !== false; // Assume more pages unless explicitly false
      
      // Rate limit delay between pages
      if (page < endPage) {
        await new Promise(r => setTimeout(r, 1000)); // Increased delay to avoid rate limiting
      }
    }
    
    renderCompanyResults();
    saveState();
    
    if (totalFound > 0) {
      showStatus(`Found ${state.companyResults.length} companies total`, 'success');
    } else if (state.companyResults.length === 0) {
      showStatus('No companies found. Try different filters.', 'info');
    }
    
  } catch (err) {
    console.error('Company search error:', err);
    showStatus(`Search failed: ${err.message}`, 'error');
  } finally {
    state.isLoading = false;
    elements.searchCompaniesBtn.disabled = false;
    elements.searchCompaniesBtn.textContent = 'Search Companies on LinkedIn';
    elements.loadMoreCompaniesBtn.disabled = !state.companyHasMore;
    elements.loadMoreCompaniesBtn.textContent = `Load More (Page ${state.companyCurrentPage})`;
  }
}

async function searchPeople(isNewSearch = true) {
  if (state.isLoading) return;
  
  if (state.selectedCompanies.size === 0) {
    showStatus('Please select at least one company first', 'error');
    return;
  }
  
  state.isLoading = true;
  
  if (isNewSearch) {
    state.peopleResults = [];
    state.selectedPeople.clear();
    state.peopleCurrentPage = 1;
  }
  
  const maxPages = parseInt(elements.peopleMaxPages.value) || 5;
  const startPage = state.peopleCurrentPage;
  const endPage = Math.min(startPage + maxPages - 1, 100);
  
  // Update UI
  elements.searchPeopleBtn.disabled = true;
  elements.searchPeopleBtn.textContent = 'Searching...';
  elements.loadMorePeopleBtn.disabled = true;
  elements.peopleResultsCard.classList.remove('hidden');
  
  if (isNewSearch) {
    elements.peopleResultsContainer.innerHTML = `
      <div class="loading">
        <div class="loading-spinner"></div>
        <div>Searching LinkedIn for people...</div>
        <div class="loading-progress" id="people-loading-progress">Page 1 of ${maxPages}</div>
      </div>
    `;
  }
  
  clearStatus();
  
  try {
    let totalFound = 0;
    
    for (let page = startPage; page <= endPage; page++) {
      // Update progress
      const progressEl = document.getElementById('people-loading-progress');
      if (progressEl) {
        progressEl.textContent = `Page ${page - startPage + 1} of ${endPage - startPage + 1}`;
      }
      
      const url = buildPeopleSearchUrl(page);
      console.log('Searching people:', url);
      
      const result = await chrome.runtime.sendMessage({
        action: 'scrapeLinkedInSearch',
        url: url,
        type: 'people'
      });
      
      if (result.error) {
        showStatus(result.error, 'error');
        break;
      }
      
      if (result.results && result.results.length > 0) {
        // Deduplicate by profile URL
        const existingUrls = new Set(state.peopleResults.map(p => p.profileUrl));
        const newResults = result.results.filter(p => !existingUrls.has(p.profileUrl));
        state.peopleResults.push(...newResults);
        totalFound += newResults.length;
      } else {
        // No results on this page - we've reached the end
        console.log('No results on page', page, '- stopping');
        state.peopleHasMore = false;
        break;
      }
      
      state.peopleCurrentPage = page + 1;
      state.peopleHasMore = result.hasNextPage !== false; // Assume more pages unless explicitly false
      
      // Rate limit delay between pages
      if (page < endPage) {
        await new Promise(r => setTimeout(r, 1000)); // Increased delay to avoid rate limiting
      }
    }
    
    await renderPeopleResults();
    saveState();
    
    if (totalFound > 0) {
      showStatus(`Found ${state.peopleResults.length} people total`, 'success');
    } else if (state.peopleResults.length === 0) {
      showStatus('No people found. Try different keywords.', 'info');
    }
    
  } catch (err) {
    console.error('People search error:', err);
    showStatus(`Search failed: ${err.message}`, 'error');
  } finally {
    state.isLoading = false;
    elements.searchPeopleBtn.disabled = false;
    elements.searchPeopleBtn.textContent = 'Search People on LinkedIn';
    elements.loadMorePeopleBtn.disabled = !state.peopleHasMore;
    elements.loadMorePeopleBtn.textContent = `Load More (Page ${state.peopleCurrentPage})`;
  }
}

// ============================================================================
// RENDERING
// ============================================================================

function renderCompanyResults() {
  if (state.companyResults.length === 0) {
    elements.companyResultsContainer.innerHTML = `
      <div class="empty-state">
        <p>No companies found</p>
        <p style="font-size: 12px; color: #999;">Try different filters or keywords</p>
      </div>
    `;
    elements.companyResultsCount.textContent = '';
    elements.proceedToStep2Btn.disabled = true;
    return;
  }
  
  elements.companyResultsCount.textContent = `(${state.companyResults.length} companies)`;
  
  let html = `
    <div class="select-all-row">
      <input type="checkbox" id="select-all-companies" class="result-checkbox">
      <label for="select-all-companies" style="margin: 0; cursor: pointer;">Select all</label>
    </div>
  `;
  
  html += '<div class="results-list">';
  
  for (const company of state.companyResults) {
    const isSelected = state.selectedCompanies.has(company.id);
    
    html += `
      <div class="result-item" data-id="${escapeHtml(company.id)}">
        <input type="checkbox" class="result-checkbox company-checkbox" 
               data-id="${escapeHtml(company.id)}" ${isSelected ? 'checked' : ''}>
        <div class="result-info">
          <div class="result-name">
            ${company.url ? `<a href="${escapeHtml(company.url)}" target="_blank">${escapeHtml(company.name)}</a>` : escapeHtml(company.name)}
          </div>
          ${company.industry ? `<div class="result-title">${escapeHtml(company.industry)}</div>` : ''}
          ${company.details ? `<div class="result-details">${escapeHtml(company.details)}</div>` : ''}
          ${company.followers ? `<div class="result-details">${escapeHtml(company.followers)}</div>` : ''}
        </div>
      </div>
    `;
  }
  
  html += '</div>';
  elements.companyResultsContainer.innerHTML = html;
  
  setupCompanyCheckboxHandlers();
  updateProceedButton();
}

function setupCompanyCheckboxHandlers() {
  // Individual checkboxes
  elements.companyResultsContainer.querySelectorAll('.company-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      const company = state.companyResults.find(c => c.id === id);
      
      if (e.target.checked && company) {
        state.selectedCompanies.set(id, company);
      } else {
        state.selectedCompanies.delete(id);
      }
      
      updateSelectAllCompaniesCheckbox();
      updateProceedButton();
      saveState();
    });
  });
  
  // Select all checkbox
  const selectAll = document.getElementById('select-all-companies');
  if (selectAll) {
    selectAll.addEventListener('change', (e) => {
      const checkboxes = elements.companyResultsContainer.querySelectorAll('.company-checkbox');
      checkboxes.forEach(checkbox => {
        checkbox.checked = e.target.checked;
        const id = checkbox.dataset.id;
        const company = state.companyResults.find(c => c.id === id);
        
        if (e.target.checked && company) {
          state.selectedCompanies.set(id, company);
        } else {
          state.selectedCompanies.delete(id);
        }
      });
      updateProceedButton();
      saveState();
    });
  }
}

function updateSelectAllCompaniesCheckbox() {
  const selectAll = document.getElementById('select-all-companies');
  if (!selectAll) return;
  
  const checkboxes = elements.companyResultsContainer.querySelectorAll('.company-checkbox');
  const checkedCount = elements.companyResultsContainer.querySelectorAll('.company-checkbox:checked').length;
  const totalCount = checkboxes.length;
  
  selectAll.checked = totalCount > 0 && checkedCount === totalCount;
  selectAll.indeterminate = checkedCount > 0 && checkedCount < totalCount;
}

function updateProceedButton() {
  const count = state.selectedCompanies.size;
  elements.proceedToStep2Btn.textContent = `Search People at Selected (${count})`;
  elements.proceedToStep2Btn.disabled = count === 0;
}

async function renderPeopleResults() {
  if (state.peopleResults.length === 0) {
    elements.peopleResultsContainer.innerHTML = `
      <div class="empty-state">
        <p>No people found</p>
        <p style="font-size: 12px; color: #999;">Try different keywords</p>
      </div>
    `;
    elements.peopleResultsCount.textContent = '';
    elements.addToQueueBtn.disabled = true;
    return;
  }
  
  // Get current queue to check which people are already added
  const queueStatus = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getStatus' }, resolve);
  });
  const queueUrls = new Set((queueStatus.queue || []).map(item => item.profileUrl));
  
  elements.peopleResultsCount.textContent = `(${state.peopleResults.length} people)`;
  
  let html = `
    <div class="select-all-row">
      <input type="checkbox" id="select-all-people" class="result-checkbox">
      <label for="select-all-people" style="margin: 0; cursor: pointer;">Select all</label>
    </div>
  `;
  
  html += '<div class="results-list">';
  
  state.peopleResults.forEach((person, index) => {
    const isSelected = state.selectedPeople.has(index);
    const isInQueue = queueUrls.has(person.profileUrl);
    
    html += `
      <div class="result-item ${isInQueue ? 'in-queue' : ''}" data-index="${index}">
        <input type="checkbox" class="result-checkbox person-checkbox" 
               data-index="${index}" ${isSelected ? 'checked' : ''} ${isInQueue ? 'disabled' : ''}>
        <div class="result-info">
          <div class="result-name">
            <a href="${escapeHtml(person.profileUrl)}" target="_blank">${escapeHtml(person.name)}</a>
            ${person.connectionDegree ? `<span class="result-badge">${escapeHtml(person.connectionDegree)}</span>` : ''}
            ${isInQueue ? '<span class="result-badge in-queue-badge">In Queue</span>' : ''}
          </div>
          ${person.title ? `<div class="result-title">${escapeHtml(person.title)}</div>` : ''}
          ${person.location ? `<div class="result-details">${escapeHtml(person.location)}</div>` : ''}
          ${person.summary ? `<div class="result-details">${escapeHtml(person.summary)}</div>` : ''}
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  elements.peopleResultsContainer.innerHTML = html;
  
  setupPeopleCheckboxHandlers();
  updateAddToQueueButton();
}

function setupPeopleCheckboxHandlers() {
  // Individual checkboxes (only non-disabled ones)
  elements.peopleResultsContainer.querySelectorAll('.person-checkbox:not(:disabled)').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const index = parseInt(e.target.dataset.index);
      
      if (e.target.checked) {
        state.selectedPeople.add(index);
      } else {
        state.selectedPeople.delete(index);
      }
      
      updateSelectAllPeopleCheckbox();
      updateAddToQueueButton();
    });
  });
  
  // Select all checkbox - only affects non-disabled checkboxes
  const selectAll = document.getElementById('select-all-people');
  if (selectAll) {
    selectAll.addEventListener('change', (e) => {
      // Only select/deselect checkboxes that are not disabled (not in queue)
      const checkboxes = elements.peopleResultsContainer.querySelectorAll('.person-checkbox:not(:disabled)');
      checkboxes.forEach(checkbox => {
        checkbox.checked = e.target.checked;
        const index = parseInt(checkbox.dataset.index);
        
        if (e.target.checked) {
          state.selectedPeople.add(index);
        } else {
          state.selectedPeople.delete(index);
        }
      });
      updateAddToQueueButton();
    });
  }
}

function updateSelectAllPeopleCheckbox() {
  const selectAll = document.getElementById('select-all-people');
  if (!selectAll) return;
  
  // Only count non-disabled checkboxes (exclude people already in queue)
  const checkboxes = elements.peopleResultsContainer.querySelectorAll('.person-checkbox:not(:disabled)');
  const checkedCount = elements.peopleResultsContainer.querySelectorAll('.person-checkbox:not(:disabled):checked').length;
  const totalCount = checkboxes.length;
  
  selectAll.checked = totalCount > 0 && checkedCount === totalCount;
  selectAll.indeterminate = checkedCount > 0 && checkedCount < totalCount;
}

function updateAddToQueueButton() {
  const count = state.selectedPeople.size;
  elements.addToQueueBtn.textContent = `Add Selected to Queue (${count})`;
  elements.addToQueueBtn.disabled = count === 0;
}

// ============================================================================
// STEP NAVIGATION
// ============================================================================

function updateUI() {
  if (state.currentStep === 1) {
    elements.step1Container.classList.remove('hidden');
    elements.step2Container.classList.add('hidden');
    elements.step1Indicator.classList.add('active');
    elements.step1Indicator.classList.remove('completed');
    elements.step2Indicator.classList.remove('active');
    elements.step2Indicator.classList.remove('completed');
  } else {
    elements.step1Container.classList.add('hidden');
    elements.step2Container.classList.remove('hidden');
    elements.step1Indicator.classList.remove('active');
    elements.step1Indicator.classList.add('completed');
    elements.step2Indicator.classList.add('active');
    elements.step2Indicator.classList.remove('completed');
    
    // Update selected companies summary
    updateSelectedCompaniesSummary();
  }
}

function proceedToStep2() {
  if (state.selectedCompanies.size === 0) {
    showStatus('Please select at least one company', 'error');
    return;
  }
  
  state.currentStep = 2;
  saveState();
  updateUI();
}

function backToStep1() {
  state.currentStep = 1;
  saveState();
  updateUI();
}

function updateSelectedCompaniesSummary() {
  elements.selectedCount.textContent = state.selectedCompanies.size;
  
  const names = Array.from(state.selectedCompanies.values())
    .map(c => c.name)
    .slice(0, 5)
    .join(', ');
  
  let text = names;
  if (state.selectedCompanies.size > 5) {
    text += ` and ${state.selectedCompanies.size - 5} more`;
  }
  
  elements.selectedCompaniesList.textContent = text;
}

// ============================================================================
// ADD TO QUEUE
// ============================================================================

async function addSelectedToQueue() {
  if (state.selectedPeople.size === 0) return;
  
  const peopleToAdd = Array.from(state.selectedPeople)
    .map(index => state.peopleResults[index])
    .filter(Boolean);
  
  if (peopleToAdd.length === 0) {
    showStatus('No people selected', 'error');
    return;
  }
  
  elements.addToQueueBtn.disabled = true;
  elements.addToQueueBtn.textContent = 'Adding...';
  
  let added = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const person of peopleToAdd) {
    try {
      const result = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'addToQueue',
          profile: {
            name: person.name,
            profileUrl: person.profileUrl
          }
        }, resolve);
      });
      
      if (result?.success) {
        added++;
      } else if (result?.error === 'Already in queue') {
        skipped++;
      } else {
        errors++;
      }
    } catch (err) {
      console.error('Error adding to queue:', err);
      errors++;
    }
  }
  
  // Clear selection
  state.selectedPeople.clear();
  await renderPeopleResults();
  
  // Show status
  let message = `Added ${added} lead${added !== 1 ? 's' : ''} to queue`;
  if (skipped > 0) {
    message += `, ${skipped} already in queue`;
  }
  if (errors > 0) {
    message += `, ${errors} failed`;
  }
  
  showStatus(message, errors > 0 ? 'error' : 'success');
  
  elements.addToQueueBtn.disabled = true;
  elements.addToQueueBtn.textContent = 'Add Selected to Queue (0)';
}

// ============================================================================
// UTILITIES
// ============================================================================

function showStatus(message, type) {
  elements.statusContainer.innerHTML = `
    <div class="status-message ${type}">${escapeHtml(message)}</div>
  `;
  
  // Auto-clear success messages after 5 seconds
  if (type === 'success') {
    setTimeout(() => {
      if (elements.statusContainer.querySelector(`.status-message.${type}`)) {
        elements.statusContainer.innerHTML = '';
      }
    }, 5000);
  }
}

function clearStatus() {
  elements.statusContainer.innerHTML = '';
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
