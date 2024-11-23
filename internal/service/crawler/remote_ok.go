package crawler

import (
	"context"
	"fmt"
	"jd-matcher/utility"
	"strings"

	"github.com/anaskhan96/soup"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/text/gstr"
	"github.com/gogf/gf/v2/util/gconv"
)

const REMOTE_OK_BASE_URL = "https://remoteok.com"

var REMOTE_OK_JOB_TYPES = map[string]string{
	"Engineer":  "engineer",
	"Developer": "dev",
}

var remote_ok_locations = map[string]string{
	"Worldwide": "Worldwide",
}

func GetRemoteOkJobs(ctx context.Context, jobTypes, locations []string, offset int) ([]CommonJob, error) {

	var validJobTypes []string
	for _, jobType := range jobTypes {
		if val, ok := REMOTE_OK_JOB_TYPES[jobType]; ok {
			validJobTypes = append(validJobTypes, val)
		}
	}
	var jobTypeStr = strings.Join(validJobTypes, ",")

	var validLocations []string
	for _, location := range locations {
		if val, ok := remote_ok_locations[location]; ok {
			validLocations = append(validLocations, val)
		}
	}
	var locationStr = strings.Join(validLocations, ",")

	// https://remoteok.com/?tags=dev,engineer&location=Worldwide&action=get_jobs&offset=20
	var reqUrl = REMOTE_OK_BASE_URL + "/?tags=" + jobTypeStr + "&" + "location=" + locationStr + "&" + "action=get_jobs&offset=" + gconv.String(offset)
	resp, err := utility.GetContent(ctx, reqUrl)
	if err != nil {
		return nil, err
	}

	jobs := parseRemoteOkMainPageJobs(ctx, resp)

	return jobs, nil
}

func parseRemoteOkMainPageJobs(ctx context.Context, htmlStr string) (jobs []CommonJob) {
	defer func(ctx context.Context) {
		if rec := recover(); rec != nil {
			g.Log().Line().Error(ctx, fmt.Sprintf("parse remote ok job list failed: %s", rec))
		}
	}(ctx)

	// if htmlStr start with <tr, then surround it with <table></table>
	if strings.HasPrefix(htmlStr, "<tr") {
		htmlStr = "<table>" + htmlStr + "</table>"
	}

	docs := soup.HTMLParse(htmlStr)
	if docs.Error != nil {
		panic(docs.Error)
	}
	jobExpends := docs.FindAll("tr", "class", "expand")
	allTr := docs.FindAll("tr")
	fmt.Println(len(allTr))

	for _, jobExpend := range jobExpends {
		var (
			jobTitle       string
			jobUrl         string
			jobDescription string
		)
		jobTitle = jobExpend.Find("h1").Text()
		if jobExpend.Find("input", "class", "share-job-copy-paste").Pointer == nil {
			continue
		}
		jobDescription = jobExpend.Find("div", "class", "html").FullText()

		job := CommonJob{
			Title:       gstr.Trim(jobTitle),
			Description: gstr.Trim(jobDescription),
		}

		dataId := jobExpend.Attrs()["data-id"]
		if dataId != "" {
			jobHeader := docs.Find("tr", "class", "job-"+dataId)
			jobUrl = jobHeader.Attrs()["data-url"]
			job.Url = REMOTE_OK_BASE_URL + jobUrl
			if jobHeader.Pointer != nil {
				jobTags := jobHeader.Find("td", "class", "tags")
				jobTagsH3 := jobTags.FindAll("h3")

				for _, jobTagH3 := range jobTagsH3 {
					job.Tags = append(job.Tags, gstr.TrimAll(jobTagH3.Text()))
				}
			}
		}

		jobs = append(jobs, job)
	}

	return jobs
}
