// Script to generate sample Excel files for testing
// Run with: node generate-sample-data.js

import * as XLSX from 'xlsx';
import fs from 'fs';

// Indian names data
const firstNames = [
    'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan',
    'Aadhya', 'Ananya', 'Aaradhya', 'Diya', 'Priya', 'Sneha', 'Kavya', 'Meera', 'Riya', 'Anika',
    'Rahul', 'Rohit', 'Amit', 'Sumit', 'Vikram', 'Ajay', 'Vijay', 'Rajesh', 'Suresh', 'Mahesh',
    'Pooja', 'Neha', 'Anjali', 'Komal', 'Deepika', 'Shweta', 'Megha', 'Nisha', 'Swati', 'Pallavi',
    'Harsh', 'Karan', 'Nikhil', 'Saurabh', 'Gaurav', 'Akash', 'Vishal', 'Kunal', 'Sahil', 'Mohit',
    'Shruti', 'Kritika', 'Tanvi', 'Simran', 'Mansi', 'Divya', 'Bhavna', 'Rashmi', 'Nikita', 'Sakshi'
];

const lastNames = [
    'Sharma', 'Verma', 'Singh', 'Kumar', 'Patel', 'Gupta', 'Jain', 'Agarwal', 'Mishra', 'Pandey',
    'Shah', 'Mehta', 'Joshi', 'Rao', 'Reddy', 'Nair', 'Menon', 'Iyer', 'Pillai', 'Krishnan',
    'Chopra', 'Malhotra', 'Kapoor', 'Khanna', 'Bhatia', 'Arora', 'Sethi', 'Kohli', 'Bansal', 'Goyal',
    'Das', 'Ghosh', 'Bose', 'Sen', 'Roy', 'Mukherjee', 'Chatterjee', 'Banerjee', 'Dutta', 'Sarkar',
    'Patil', 'Deshmukh', 'Kulkarni', 'Joshi', 'Deshpande', 'Sawant', 'Pawar', 'Jadhav', 'More', 'Shinde'
];

const courses = ['BCA', 'MCA', 'BBA', 'MBA', 'B.Tech', 'M.Tech', 'B.Com', 'M.Com', 'BA', 'MA', 'B.Sc', 'M.Sc', 'BDS', 'MBBS', 'LLB', 'LLM'];
const specializations = ['Computer Science', 'Data Science', 'Marketing', 'Finance', 'HR', 'IT', 'Electronics', 'Mechanical', 'Civil', 'AI/ML'];
const cities = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Kolkata', 'Hyderabad', 'Pune', 'Ahmedabad', 'Jaipur', 'Lucknow', 'Surat', 'Nagpur', 'Indore', 'Bhopal', 'Vadodara', 'Chandigarh', 'Coimbatore', 'Kochi', 'Trivandrum', 'Visakhapatnam'];
const states = {
    'Mumbai': 'Maharashtra', 'Pune': 'Maharashtra', 'Nagpur': 'Maharashtra',
    'Delhi': 'Delhi',
    'Bangalore': 'Karnataka',
    'Chennai': 'Tamil Nadu', 'Coimbatore': 'Tamil Nadu',
    'Kolkata': 'West Bengal',
    'Hyderabad': 'Telangana', 'Visakhapatnam': 'Andhra Pradesh',
    'Ahmedabad': 'Gujarat', 'Surat': 'Gujarat', 'Vadodara': 'Gujarat',
    'Jaipur': 'Rajasthan',
    'Lucknow': 'Uttar Pradesh',
    'Indore': 'Madhya Pradesh', 'Bhopal': 'Madhya Pradesh',
    'Chandigarh': 'Punjab',
    'Kochi': 'Kerala', 'Trivandrum': 'Kerala'
};

const genders = ['Male', 'Female'];
const leadSources = ['WEBSITE', 'REFERRAL', 'SOCIAL_MEDIA', 'WALK_IN', 'PHONE_INQUIRY', 'MANUAL'];
const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

// Helper functions
function randomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomNumber(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generatePhone() {
    return '9' + randomNumber(100000000, 999999999);
}

function generateEmail(name) {
    const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'];
    return name.toLowerCase().replace(' ', '.') + randomNumber(1, 999) + '@' + randomElement(domains);
}

function generateEnrollmentNo(index) {
    const year = randomNumber(2020, 2024);
    return `EN${year}${String(index).padStart(6, '0')}`;
}

function generateDOB() {
    const year = randomNumber(1995, 2005);
    const month = String(randomNumber(1, 12)).padStart(2, '0');
    const day = String(randomNumber(1, 28)).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function generatePincode() {
    return String(randomNumber(100000, 999999));
}

// Generate Students Data
function generateStudentsData(count) {
    const students = [];

    for (let i = 1; i <= count; i++) {
        const firstName = randomElement(firstNames);
        const lastName = randomElement(lastNames);
        const fullName = `${firstName} ${lastName}`;
        const city = randomElement(cities);

        students.push({
            'Enrollment No': generateEnrollmentNo(i),
            'Full Name': fullName,
            'Email': generateEmail(fullName),
            'Phone': generatePhone(),
            'Alternate Phone': Math.random() > 0.7 ? generatePhone() : '',
            'Date of Birth': generateDOB(),
            'Gender': randomElement(genders),
            'Course': randomElement(courses),
            'Specialization': Math.random() > 0.5 ? randomElement(specializations) : '',
            'Batch Year': randomNumber(2020, 2024),
            'Semester': randomNumber(1, 8),
            'City': city,
            'State': states[city] || 'Unknown',
            'Pincode': generatePincode(),
            'Address': `${randomNumber(1, 999)}, Street ${randomNumber(1, 50)}, ${city}`,
            'Status': Math.random() > 0.1 ? 'ACTIVE' : (Math.random() > 0.5 ? 'INACTIVE' : 'ALUMNI')
        });

        if (i % 10000 === 0) {
            console.log(`Generated ${i} students...`);
        }
    }

    return students;
}

// Generate Leads Data
function generateLeadsData(count) {
    const leads = [];

    for (let i = 1; i <= count; i++) {
        const firstName = randomElement(firstNames);
        const lastName = randomElement(lastNames);
        const fullName = `${firstName} ${lastName}`;

        leads.push({
            'Full Name': fullName,
            'Email': generateEmail(fullName),
            'Phone': generatePhone(),
            'Alternate Phone': Math.random() > 0.8 ? generatePhone() : '',
            'Interested Course': randomElement(courses),
            'Source': randomElement(leadSources),
            'Priority': randomElement(priorities),
            'Notes': `Inquiry about ${randomElement(courses)} course. Interested in ${randomElement(specializations)}.`
        });

        if (i % 5000 === 0) {
            console.log(`Generated ${i} leads...`);
        }
    }

    return leads;
}

// Main execution
console.log('🚀 Starting sample data generation...\n');

// Create output directory
const outputDir = './sample-data';
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

// Generate different sizes
const sizes = [
    { name: 'small', students: 100, leads: 50 },
    { name: 'medium', students: 1000, leads: 500 },
    { name: 'large', students: 10000, leads: 5000 },
    { name: 'xlarge', students: 50000, leads: 25000 },
    // Uncomment for really large files (will take time)
    // { name: 'massive', students: 200000, leads: 100000 },
];

for (const size of sizes) {
    console.log(`\n📊 Generating ${size.name} dataset...`);

    // Generate students
    console.log(`  Creating ${size.students} students...`);
    const studentsData = generateStudentsData(size.students);
    const studentsWorkbook = XLSX.utils.book_new();
    const studentsSheet = XLSX.utils.json_to_sheet(studentsData);
    XLSX.utils.book_append_sheet(studentsWorkbook, studentsSheet, 'Students');
    const studentsFile = `${outputDir}/students_${size.name}_${size.students}.xlsx`;
    XLSX.writeFile(studentsWorkbook, studentsFile);
    console.log(`  ✅ Saved: ${studentsFile}`);

    // Generate leads
    console.log(`  Creating ${size.leads} leads...`);
    const leadsData = generateLeadsData(size.leads);
    const leadsWorkbook = XLSX.utils.book_new();
    const leadsSheet = XLSX.utils.json_to_sheet(leadsData);
    XLSX.utils.book_append_sheet(leadsWorkbook, leadsSheet, 'Leads');
    const leadsFile = `${outputDir}/leads_${size.name}_${size.leads}.xlsx`;
    XLSX.writeFile(leadsWorkbook, leadsFile);
    console.log(`  ✅ Saved: ${leadsFile}`);
}

console.log('\n🎉 All sample files generated successfully!');
console.log(`📁 Files are in: ${outputDir}/`);
console.log('\nGenerated files:');
fs.readdirSync(outputDir).forEach(file => {
    const stats = fs.statSync(`${outputDir}/${file}`);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`  - ${file} (${sizeMB} MB)`);
});
