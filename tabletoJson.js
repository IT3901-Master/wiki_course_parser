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

var university_name_list = ["University of California, Santa Barbara","University of Queensland","University of New South Wales"];

var urlList = ["https://www.ntnu.no/wiki/display/utland/UCSB+courses+matching+IDI+courses","https://www.ntnu.no/wiki/display/utland/University+of+Queensland+-+Brisbane","https://www.ntnu.no/wiki/display/utland/University+of+New+South+Wales+-+Sydney+-+UNSW"];

let counter = 0;
function make(url, university_name, iteration, lists) {
    var fullAbroadCourseList = [];
    var courseMatchList = [];
    var abroadCourseCodes = [];
    console.log("Calling async for: " + university_name);
    convertUrl(url, function (tablesAsJson) {
        console.log("Working with: " + university_name);
        //Get the first table from results
        var courseList = tablesAsJson[0];
        for (var course in courseList) {
            //console.log(course);
            //console.log("Course in university: " + university_name);
            var newListOfContent = {};
            var courseContent = courseList[course];

            var abroadCourseTitle = courseContent[Object.keys(courseContent)[0]];


            // Getting the HREF for an abroadcourse link setup.
            if (abroadCourseTitle.match(/href="([^"]*)/)) {
                var description_url = abroadCourseTitle.match(/href="([^"]*)/)[1];
            }
            else {
                var description_url = "";
            }

            abroadCourseTitle = striptags(abroadCourseTitle.replaceAll("&#xA0;", " "));


            var parsedStudy = striptags(courseContent[Object.keys(courseContent)[1]]);
            parsedStudy = he.decode(parsedStudy);
            var studyPoints = parseFloat(parsedStudy.toString().replace(/,/g, ".").substring(0,3));
            var homeCourseTitle = striptags(courseContent[Object.keys(courseContent)[2]].replaceAll("&#xA0;", " "));
            var comment = he.decode(striptags(courseContent["Kommentar"]));
            var approvalDate = he.decode(striptags(courseContent["OK"])).substring(0, 10).replaceAll(".", "-").replaceAll(' ','');

            abroadCourseTitle = abroadCourseTitle.replace(/-/g, "").replace(/=/g, "").trim();

            if (abroadCourseTitle.indexOf(' ') > 5) {
                var abroadCode = abroadCourseTitle.substring(0, abroadCourseTitle.indexOf(' ')).replace(/\s+/g, '').replace(/-/g, "").replace(/=/g, "").trim();
                var abroadTitle = abroadCourseTitle.substring(abroadCourseTitle.indexOf(' ') + 1).replace(/-/g, "").replace(/=/g, "").trim();
            }
            else {
                // if space should be removed
                //var abroadCode = abroadCourseTitle.substring(0, abroadCourseTitle.indexOf(' ',abroadCourseTitle.indexOf(' ') +1)).replace(/\s+/g, '').replace(/-/g, "").replace(/=/g, "").trim();
                var abroadCode = abroadCourseTitle.substring(0, abroadCourseTitle.indexOf(' ',abroadCourseTitle.indexOf(' ') +1)).replace(/-/g, "").replace(/=/g, "").trim();
                var abroadTitle = abroadCourseTitle.substring(abroadCourseTitle.indexOf(' ',abroadCourseTitle.indexOf(' ')+1) + 1).replace(/-/g, "").replace(/=/g, "").trim();
            }




            // NTNU course code parsing
            var homeCode = he.decode(homeCourseTitle).substring(0, 7).trim();
            var homeTitle = homeCourseTitle.substring(8, homeCourseTitle.length).replace(/-/g, "").replace(/=/g, "").trim();

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


            // Making the abroadcourse list
            newListOfContent["model"] = "utsida.abroadcourse";
            //newListOfContent["pk"] = null;
            newListOfContent["fields"] = {
                "code": abroadCode,
                "name": abroadTitle,
                "university": [university_name],
                "description_url": description_url,
                "study_points": studyPoints,
                "pre_requisites": []
            };

            //Check if abroadcourse already is appended, if not, then it adds it.
            if (abroadCourseCodes.indexOf(abroadCode) == -1) {
                fullAbroadCourseList.push(newListOfContent);
                abroadCourseCodes.push(abroadCode);
            }

            var courseMatch = {};

            //courseMatch["pk"] = counter;
            counter++;
            courseMatch["model"] = "utsida.coursematch";

            //Building the fields
            var fields = {};
            fields["homeCourse"] = [homeCode];
            fields["abroadCourse"] = [abroadCode,abroadTitle, university_name];
            if (approvalDate == '' || approvalDate == ' ') {
                fields["approved"] = false
            }
            else if(courseContent["OK"].indexOf("<s>") !== -1) {
                fields["approved"] = false
            }
            else {
                fields["approved"] = true;
                fields["approval_date"] = approvalDate;
            }
            fields["comment"] = comment;
            courseMatch["fields"] = fields;
            courseMatchList.push(courseMatch);

        }
        console.log("HEEEEEEEEY");
        console.log("Finished working with: " + university_name);
        lists([fullAbroadCourseList, courseMatchList], iteration);

    });
}

for (let i = 0; i < urlList.length; i++) {
    make(urlList[i], university_name_list[i], i, function (lists, count) {
        console.log("returned values" + " " + university_name_list[count]);
        var file = '/Users/trulsmp/Documents/master/scripting/abroad_courses' + count + '.json';
        var file2 = '/Users/trulsmp/Documents/master/scripting/course_matches' + count + '.json';
        jsonfile.writeFileSync(file, lists[0]);
        jsonfile.writeFileSync(file2, lists[1]);
    });
}







