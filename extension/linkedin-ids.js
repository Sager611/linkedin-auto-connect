// LinkedIn Search ID Mappings
// These IDs are used to construct LinkedIn search URLs

const LINKEDIN_IDS = {
  // Industry codes for company search
  // Parameter: industryCompanyVertical
  industries: {
    '1': 'Defense and Space Manufacturing',
    '17': 'Medical Equipment Manufacturing',
    '52': 'Aviation and Aerospace Component Manufacturing',
    '53': 'Motor Vehicle Manufacturing',
    '62': 'Railroad Equipment Manufacturing',
    '112': 'Appliances, Electrical, and Electronics Manufacturing',
    '135': 'Industrial Machinery Manufacturing',
    '147': 'Automation Machinery Manufacturing',
    '1042': 'Motor Vehicle Parts Manufacturing',
    '3248': 'Robotics Engineering'
  },
  
  // Location geo URNs
  // Parameter: companyHqGeo (companies) or geoUrn (people)
  locations: {
    '101165590': 'United States',
    '103644278': 'United Kingdom',
    '101174742': 'Germany',
    '102890883': 'France',
    '102095887': 'California, US',
    '102277331': 'Texas, US',
    '102571732': 'New York, US',
    '90000084': 'San Francisco Bay Area',
    '102257491': 'London, UK'
  },
  
  // Company size codes
  // Parameter: companySize
  companySizes: {
    'B': '1-10 employees',
    'C': '11-50 employees',
    'D': '51-200 employees',
    'E': '201-500 employees',
    'F': '501-1000 employees',
    'G': '1001-5000 employees',
    'H': '5001-10000 employees',
    'I': '10001+ employees'
  }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LINKEDIN_IDS;
}
