var tabletojson = require('tabletojson');
var jsonfile = require('jsonfile');
var striptags = require('striptags');
var Q = require('q');
var cheerio = require('cheerio');
var request = require('request');
var he = require('he');

function convert(html) {
    var jsonResponse = [];
    var $ = cheerio.load(html);

    $('table').each(function (i, table) {
        var tableAsJson = [];
        // Get column headings
        // @fixme Doesn't support vertical column headings.
        // @todo Try to support badly formated tables.
        var columnHeadings = [];
        $(table).find('tr').each(function (i, row) {
            $(row).find('th').each(function (j, cell) {
                columnHeadings[j] = $(cell).text().trim();
            });
        });

        // Fetch each row
        $(table).find('tr').each(function (i, row) {
            var rowAsJson = {};
            $(row).find('td').each(function (j, cell) {
                if (columnHeadings[j]) {
                    rowAsJson[columnHeadings[j]] = $(cell).html();
                } else {
                    rowAsJson[j] = $(cell).html();
                }
            });

            // Skip blank rows
            if (JSON.stringify(rowAsJson) != '{}')
                tableAsJson.push(rowAsJson);
        });

        // Add the table to the response
        if (tableAsJson.length != 0)
            jsonResponse.push(tableAsJson);
    });
    return jsonResponse;
}

convertUrl = function (url, callback) {
    if (typeof(callback) === "function") {
        // Use a callback (if passed)
        fetchUrl(url)
            .then(function (html) {
                callback.call(this, convert(html));
            });
    } else {
        // If no callback, return a promise
        return fetchUrl(url)
            .then(function (html) {
                return convert(html);
            });
    }
};

function fetchUrl(url, callback) {
    var deferred = Q.defer();
    request(url, function (error, response, body) {
        deferred.resolve(body);
    });
    return deferred.promise;
}


String.prototype.replaceAll = function (search, replacement) {
    var target = this;
    return target.split(search).join(replacement);
};

var fullAbroadCourseList = [];
var courseMatchList = [];
var abroadCourseCodes = [];

let counter = 0;
function make(url, university_name, iteration, lists) {

    console.log("Calling async for: " + university_name);
    convertUrl(url, function (tablesAsJson) {
        console.log("Working with: " + university_name);

        //Get the first table from results
        var courseList = tablesAsJson[0];
        for (var course in courseList) {
            var courseContent = courseList[course];
            parseCourseMatch(courseContent,university_name);
        }

        console.log("Finished working with: " + university_name);
        lists([fullAbroadCourseList, courseMatchList], iteration);

    });
}


function homeCourseParse(homeCourseTitle) {
    // NTNU course code parsing
    var homeCode = he.decode(homeCourseTitle).substring(0, 7).trim();
    //var homeTitle = homeCourseTitle.substring(8, homeCourseTitle.length).replace(/-/g, "").replace(/=/g, "").trim();
    if (homeCode.length < 2) {
        return;
    }

    if (homeCode.startsWith("EiT") || homeCode.startsWith("EIT") || homeCode.startsWith("eit")) {
        homeCode = "EiT";
        homeTitle = "Eksperter i Team";
    }
    else if (homeCode.startsWith("KPro")) {
        homeCode = "KPro";
        homeTitle = "Kunderstyrt Prosjekt"
    }
    else if (homeCode.startsWith("Komplement")) {
        homeCode = "K-emne";
        homeTitle = "Komplementær emne";
    }
    return (homeCode)
}

function parseAbroadCourse(courseContent, university_name) {

    var abroadCourseTitle = courseContent[Object.keys(courseContent)[0]];
    var parsedStudy = he.decode(striptags(courseContent[Object.keys(courseContent)[1]]));
    var studyPoints = parseFloat(parsedStudy.toString().replace(/,/g, ".").substring(0, 3));
    var description_url;
    var code;
    var title;

    // Getting the HREF for an abroadcourse link setup.
    if (abroadCourseTitle.match(/href="([^"]*)/)) {
        description_url = abroadCourseTitle.match(/href="([^"]*)/)[1];
    }
    else {
        description_url = "";
    }

    abroadCourseTitle = he.decode(striptags(abroadCourseTitle.replaceAll("&#xA0;", " ")));

    abroadCourseTitle = abroadCourseTitle.replace(/-/g, "").replace(/=/g, "").trim();

    if (abroadCourseTitle.indexOf(' ') > 4 && /^[a-zA-Z]+$/.test(abroadCourseTitle.substring(0, 5))) {
        var index = abroadCourseTitle.indexOf(' ', abroadCourseTitle.indexOf(' ') + 1);
        code = abroadCourseTitle.substring(0, index).replace(/-/g, "").replace(/=/g, "").trim();
        title = abroadCourseTitle.substring(index + 1).replace(/-/g, "").replace(/=/g, "").trim();
    }
    else if (abroadCourseTitle.indexOf(' ') > 5) {
        code = abroadCourseTitle.substring(0, abroadCourseTitle.indexOf(' ')).replace(/\s+/g, '').replace(/-/g, "").replace(/=/g, "").trim();
        title = abroadCourseTitle.substring(abroadCourseTitle.indexOf(' ') + 1).replace(/-/g, "").replace(/=/g, "").trim();
    }
    else {
        code = abroadCourseTitle.substring(0, abroadCourseTitle.indexOf(' ', abroadCourseTitle.indexOf(' ') + 1)).replace(/-/g, "").replace(/=/g, "").trim();
        title = abroadCourseTitle.substring(abroadCourseTitle.indexOf(' ', abroadCourseTitle.indexOf(' ') + 1) + 1).replace(/-/g, "").replace(/=/g, "").trim();
    }

    // Making the abroadcourse list
    var abroadCourseContent = {};
    abroadCourseContent["model"] = "utsida.abroadcourse";
    abroadCourseContent["fields"] = {
        "code": code,
        "name": title,
        "university": [university_name],
        "description_url": description_url,
        "study_points": studyPoints,
        "pre_requisites": []
    };

    //Check if abroadcourse already is appended, if not, then it adds it.
    if (abroadCourseCodes.indexOf(code) == -1) {
        fullAbroadCourseList.push(abroadCourseContent);
        abroadCourseCodes.push(code);
    }

    return {code:code,title:title}
}


function parseCourseMatch(courseContent, university_name) {

    var abroadCourse = parseAbroadCourse(courseContent,university_name);
    var abroadCode = abroadCourse.code;
    var abroadTitle = abroadCourse.title;


    var homeCourseTitle = striptags(courseContent[Object.keys(courseContent)[2]].replaceAll("&#xA0;", " "));
    var homeCode = homeCourseParse(homeCourseTitle);


    var comment = he.decode(striptags(courseContent["Kommentar"]));
    var approvalDate = he.decode(striptags(courseContent["OK"])).substring(0, 10).replaceAll(".", "-").replaceAll(' ', '');

    //courseMatch["pk"] = counter;
    counter++;
    var courseMatch = {};
    courseMatch["model"] = "utsida.coursematch";

    //Building the fields
    var CMfields = {};
    CMfields["homeCourse"] = [homeCode];
    CMfields["abroadCourse"] = [abroadCode, abroadTitle, university_name];
    if (approvalDate == "" || approvalDate == " " || !approvalDate || approvalDate.length < 5) {
        CMfields["approved"] = false;
    }
    else if (courseContent["OK"].indexOf("<s>") !== -1) {
        CMfields["approved"] = false
    }
    else {
        CMfields["approved"] = true;
        CMfields["approval_date"] = approvalDate;
    }
    CMfields["comment"] = comment;
    courseMatch["fields"] = CMfields;
    courseMatchList.push(courseMatch);
}


function runAll(dict) {
    for (let i = 0; i < dict.length; i++) {
        console.log(dict[i]);
        make(dict[i].url, dict[i].name, i, function (lists, count) {
            var file = '/Users/trulsmp/Documents/master/scripting/abroad_courses' + count + '.json';
            var file2 = '/Users/trulsmp/Documents/master/scripting/course_matches' + count + '.json';
            jsonfile.writeFileSync(file, lists[0]);
            jsonfile.writeFileSync(file2, lists[1]);
        });
    }
}


var oceania_university_name_list = ["University of Queensland", "University of New South Wales", "Curtin University", "Queensland University of Technology", "Royal Melbourne Institute of Technology", "University of Auckland", "University of Melbourne", "University of Western Australia", "University of Wollongong"];
var oceania_urlList = ["https://www.ntnu.no/wiki/display/utland/University+of+Queensland+-+Brisbane", "https://www.ntnu.no/wiki/display/utland/University+of+New+South+Wales+-+Sydney+-+UNSW", "https://www.ntnu.no/wiki/display/utland/Curtin+University+-+Perth", "https://www.ntnu.no/wiki/display/utland/Queensland+University+of+Technology+-+Brisbane", "https://www.ntnu.no/wiki/display/utland/Royal+Melbourne+Institute+of+Technology+-+RMIT", "https://www.ntnu.no/wiki/display/utland/University+of+Auckland+-+New+Zealand", "https://www.ntnu.no/wiki/display/utland/University+of+Melbourne+and+Swinburn", "https://www.ntnu.no/wiki/display/utland/University+of+Western+Australia+-+UWA+Perth", "https://www.ntnu.no/wiki/display/utland/University+of+Wollongong"];


var oceaniaDict = [{name:"University of Queensland", url:"https://www.ntnu.no/wiki/display/utland/University+of+Queensland+-+Brisbane"},
    {name:"University of New South Wales",url:"https://www.ntnu.no/wiki/display/utland/University+of+New+South+Wales+-+Sydney+-+UNSW"},
    {name:"Curtin University",url:"https://www.ntnu.no/wiki/display/utland/Curtin+University+-+Perth"},
    {name:"Queensland University of Technology",url:"https://www.ntnu.no/wiki/display/utland/Queensland+University+of+Technology+-+Brisbane"},
    {name:"Royal Melbourne Institute of Technology",url:"https://www.ntnu.no/wiki/display/utland/Royal+Melbourne+Institute+of+Technology+-+RMIT"},
    {name:"University of Auckland",url:"https://www.ntnu.no/wiki/display/utland/University+of+Auckland+-+New+Zealand"},
    {name:"University of Melbourne",url:"https://www.ntnu.no/wiki/display/utland/University+of+Melbourne+and+Swinburn"},
    {name:"University of Western Australia",url:"https://www.ntnu.no/wiki/display/utland/University+of+Western+Australia+-+UWA+Perth"},
    {name:"University of Wollongong",url:"https://www.ntnu.no/wiki/display/utland/University+of+Wollongong"}
    ];

var canadaDict = [{
    name: "University of British Columbia",
    url: "https://www.ntnu.no/wiki/display/utland/The+University+of+British+Columbia"
}];
var argentinaDict = [{
    name: "Universidad de Buenos Aires",
    url: "https://www.ntnu.no/wiki/display/utland/Buenos+Aires+-+UBA"
}];



runAll(argentinaDict);








