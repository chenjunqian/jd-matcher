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

func GetRemoteOkJobs(ctx context.Context, jobTypes, locations []string, offset int) ([]CommonJob, error) {

	var reqUrl = REMOTE_OK_BASE_URL + "/?action=get_jobs&offset=" + gconv.String(offset)
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
	htmlStr = gstr.Trim(htmlStr)
	if strings.HasPrefix(htmlStr, "<tr") {
		htmlStr = "<table>" + htmlStr + "</table>"
	}

	docs := soup.HTMLParse(htmlStr)
	if docs.Error != nil {
		panic(docs.Error)
	}
	jobExpends := docs.FindAll("tr", "class", "expand")

	for _, jobExpend := range jobExpends {
		var (
			jobTitle       string
			jobUrl         string
			jobDescription string
		)
		if jobExpend.Find("input", "class", "share-job-copy-paste").Pointer == nil {
			continue
		}
		if jobExpend.Find("div", "class", "html").Pointer != nil {
			jobDescription = jobExpend.Find("div", "class", "html").FullText()
		} else if jobExpend.Find("div", "class", "markdown").Pointer != nil {
			jobDescription = jobExpend.Find("div", "class", "markdown").FullText()
		}

		job := CommonJob{
			Description: gstr.Trim(jobDescription),
		}

		dataId := jobExpend.Attrs()["data-id"]
		if dataId != "" {
			// get job url
			jobHeader := docs.Find("tr", "class", "job-"+dataId)
			jobUrl = jobHeader.Attrs()["data-url"]
			job.Url = REMOTE_OK_BASE_URL + jobUrl

			// get job title
			companyPosistionTrDoc := jobHeader.Find("td", "class", "company_and_position")
			if companyPosistionTrDoc.Pointer == nil {
				continue
			}
			jobTitle = companyPosistionTrDoc.Find("h2").FullText()
			job.Title = gstr.Trim(jobTitle)

			// get job location and salary
			jobLocationSalaryDivDocs := jobHeader.FindAll("div", "class", "location")
			locationList := []string{}
			for i := 0; i < len(jobLocationSalaryDivDocs); i++ {
				if i == len(jobLocationSalaryDivDocs)-1 {
					job.Salary = gstr.Trim(jobLocationSalaryDivDocs[i].Text())
				} else {
					locationList = append(locationList, gstr.Trim(jobLocationSalaryDivDocs[i].Text()))
				}
			}

			if len(locationList) > 0 {
				job.Location = strings.Join(locationList, ",")
			}

			// get job tags
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
