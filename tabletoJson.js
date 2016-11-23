var tabletojson = require('tabletojson');
var jsonfile = require('jsonfile');
var striptags = require('striptags');
var Q = require('q');
var cheerio = require('cheerio');
var request = require('request');

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
convert = convert;

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
}

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

var university_name_list = ["University of New South Wales", "University of Queensland", "Queensland University of Technology"];

var urlList = ['https://www.ntnu.no/wiki/plugins/viewsource/viewpagesrc.action?pageId=78977206', "https://www.ntnu.no/wiki/display/utland/University+of+Queensland+-+Brisbane"];

counter = 0;

for (var i = 0; i < urlList.length; i++) {

    convertUrl(urlList[i], function (tablesAsJson) {
        var fullAbroadCourseList = [];
        var courseMatchList = [];
        var abroadCourseCodes = [];


        //Get the first table from results
        var courseList = tablesAsJson[0];


        for (var course in courseList) {
            var newListOfContent = {};
            var courseContent = courseList[course];

            var abroadCourseTitle = courseContent[Object.keys(courseContent)[0]];
            var description_url = abroadCourseTitle.match(/href="([^"]*)/)[1];
            //courseContent = striptags(courseContent.replaceAll("&#xA0;"," "));
            console.log(description_url);
            abroadCourseTitle = striptags(abroadCourseTitle.replaceAll("&#xA0;", " "));
            console.log(abroadCourseTitle);


            var studyPoints = parseFloat(courseContent[Object.keys(courseContent)[1]].replace(/,/g, "."));
            var homeCourseTitle = striptags(courseContent[Object.keys(courseContent)[2]].replaceAll("&#xA0;", " "));
            var comment = striptags(courseContent[Object.keys(courseContent)[3]].replaceAll("&#xA0;", " ").replaceAll("&#xE5;", "å").replaceAll("&#xF8;", "ø").replaceAll("&#xD8;", "Ø"));
            var approvalDate = courseContent[Object.keys(courseContent)[4]];

            abroadCourseTitle = abroadCourseTitle.replace(/-/g, "").replace(/=/g, "").trim();
            var abroadCode = abroadCourseTitle.substring(0, 8).replace(/\s+/g, '').replace(/-/g, "").replace(/=/g, "").trim();
            var abroadTitle = abroadCourseTitle.substring(8, abroadCourseTitle.length).replace(/-/g, "").replace(/=/g, "").trim();

            var homeCode = homeCourseTitle.replaceAll("&#xD8;", "Ø").substring(0, 7).trim();
            var homeTitle = homeCourseTitle.substring(8, homeCourseTitle.length).replace(/-/g, "").replace(/=/g, "").trim();

            newListOfContent["model"] = "utsida.abroadcourse";
            //newListOfContent["pk"] = null;
            newListOfContent["fields"] = {
                "code": abroadCode,
                "name": abroadTitle,
                "university": [university_name_list[i]],
                "description_url": description_url,
                "study_points": studyPoints,
                "pre_requisites": []
            };

            if (abroadCourseCodes.indexOf(abroadCode) == -1) {
                fullAbroadCourseList.push(newListOfContent);
                abroadCourseCodes.push(abroadCode);
            }


            var courseMatch = {};

            courseMatch["pk"] = counter;
            counter++;
            courseMatch["model"] = "utsida.coursematch";

            //Building the fields
            var fields = {};
            fields["homeCourse"] = [homeCode];
            var abList = [abroadCode, university_name_list[i]];
            fields["abroadCourse"] = abList;
            fields["approved"] = true;
            fields["approval_date"] = striptags(approvalDate.replaceAll("&#xA0;", " ")).substring(0, 10).replace(".", "-").replace(".", "-");
            fields["comment"] = comment;
            courseMatch["fields"] = fields;
            courseMatchList.push(courseMatch);


        }
        //console.log(fullAbroadCourseList);
        //console.log(courseMatchList);


        var file = '/Users/trulsmp/Documents/master/scripting/abroad_courses_script.json';
        var file2 = '/Users/trulsmp/Documents/master/scripting/course_matches_script.json';
        jsonfile.writeFileSync(file, fullAbroadCourseList);
        jsonfile.writeFileSync(file2, courseMatchList);

    });

}






