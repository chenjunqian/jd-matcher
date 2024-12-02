package dto

import "github.com/gogf/gf/v2/os/gtime"

type UserMatchedDetailJob struct {
	Id               string      `json:"id" orm:"id" description:""`                               //
	UserId           string      `json:"userId" orm:"user_id" description:""`                      //
	Title            string      `json:"title" orm:"title" description:""`                         //
	JobDesc          string      `json:"jobDesc" orm:"job_desc" description:""`                    //
	JobTags          []string    `json:"jobTags" orm:"job_tags" description:""`                    //
	Link             string      `json:"link" orm:"link" description:""`                           //
	Source           string      `json:"source" orm:"source" description:""`                       //
	Location         string      `json:"location" orm:"location" description:""`                   //
	Salary           string      `json:"salary" orm:"salary" description:""`                       //
	MatchScore       string      `json:"matchScore" orm:"match_score" description:""`              //
	UpdateTime       *gtime.Time `json:"updateTime" orm:"update_time" description:""`              //
	JobDescEmbedding []float32   `json:"jobDescEmbedding" orm:"job_desc_embedding" description:""` //
}

type UserMatchedJobPromptInput struct {
	JobId          string `json:"jobId"`
	JobTitle       string `json:"jobTitle"`
	JobLink        string `json:"jobLink"`
	JobDescription string `json:"jobDescription"`
	Location       string `json:"location"`
	Salary         string `json:"salary"`
}

type UserMatchedJobPromptOutput struct {
	JobId      string `json:"jobId"`
	JobTitle   string `json:"jobTitle"`
	JobLink    string `json:"jobLink"`
	MatchScore string `json:"matchScore"`
	Reason     string `json:"reason"`
}
